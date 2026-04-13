import type {
  Message,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages"
import { messages_create } from "../parser/client/anthropic"
import { logger } from "../shared/logger"
import { get_session, update_session } from "./session"
import {
  handle_cancel_booking,
  handle_check_availability,
  handle_create_booking,
  handle_get_booking,
  handle_list_bookings,
  handle_reschedule_booking,
  handle_retrieve_business_id,
} from "./tool_handlers"
import type {
  cancel_booking_input_type,
  check_availability_input_type,
  create_booking_input_type,
  get_booking_input_type,
  list_bookings_input_type,
  reschedule_booking_input_type,
  retrieve_business_id_input_type,
  tool_result_type,
} from "./types"

const MAX_TOOL_CALLS = 10

const call_api = async (
  current_time_ms: number,
  history: MessageParam[],
): Promise<Message | null> => {
  try {
    const response = await messages_create(current_time_ms, history)
    // Type-guard: response should be Message (not Stream) since we don't set stream: true
    if ("content" in response && "stop_reason" in response) {
      return response as Message
    }
    return null
  } catch (err) {
    logger.error("Anthropic API call failed", { err: String(err) })
    return null
  }
}

type use_block_result_type = {
  block: ToolResultBlockParam
  resolved_business_id?: string
}

const use_block = (
  business_id: string,
  user_id: string,
  current_time_ms: number,
  sender_key: string,
  tool_block: ToolUseBlock,
): use_block_result_type => {
  logger.info("Dispatching tool", { tool: tool_block.name, user_id, sender_key })

  const result = dispatch_tool(
    business_id,
    user_id,
    current_time_ms,
    tool_block.name,
    tool_block.input,
  )

  if (result.status === "success") {
    const resolved_business_id =
      tool_block.name === "retrieve_business_name"
        ? (result.data as { business_id: string }).business_id
        : undefined

    return {
      block: {
        type: "tool_result" as const,
        tool_use_id: tool_block.id,
        content: JSON.stringify(result.data),
      },
      resolved_business_id,
    }
  }
  return {
    block: {
      type: "tool_result" as const,
      tool_use_id: tool_block.id,
      content: result.error,
      is_error: true,
    },
  }
}

const dispatch_tool = (
  business_id: string,
  user_id: string,
  current_time_ms: number,
  tool_name: string,
  tool_input: unknown,
): tool_result_type => {
  switch (tool_name) {
    case "check_availability":
      return handle_check_availability(business_id, tool_input as check_availability_input_type)
    case "create_booking":
      return handle_create_booking(
        current_time_ms,
        business_id,
        user_id,
        tool_input as create_booking_input_type,
      )
    case "list_bookings":
      return handle_list_bookings(user_id, tool_input as list_bookings_input_type)
    case "get_booking":
      return handle_get_booking(user_id, tool_input as get_booking_input_type)
    case "cancel_booking":
      return handle_cancel_booking(user_id, tool_input as cancel_booking_input_type)
    case "reschedule_booking":
      return handle_reschedule_booking(user_id, tool_input as reschedule_booking_input_type)
    case "retrieve_business_name":
      return handle_retrieve_business_id(tool_input as retrieve_business_id_input_type)
    default:
      return { status: "error", error: `Unknown tool: ${tool_name}` }
  }
}

//  --

export const run_agent = async (
  user_id: string,
  current_time_ms: number,
  sender_key: string,
  text: string,
): Promise<string> => {
  const session = get_session(sender_key, current_time_ms)
  let business_id = session.business_id ?? ""

  const history: MessageParam[] = [...session.history, { role: "user", content: text }]

  let tool_call_count = 0
  while (true) {
    if (tool_call_count >= MAX_TOOL_CALLS) {
      logger.error("Agent exceeded max tool calls", { user_id, sender_key, tool_call_count })
      return "Something went wrong, please try again."
    }

    const response: Message | null = await call_api(current_time_ms, history)
    if (!response) {
      return "I'm having trouble connecting. Please try again in a moment."
    }

    history.push({ role: "assistant", content: response.content })

    if (response.stop_reason === "end_turn") {
      const text_block = response.content.find(
        (block: Message["content"][number]) => block.type === "text",
      )
      const reply = text_block && text_block.type === "text" ? text_block.text : ""
      update_session(current_time_ms, sender_key, {
        ...session,
        history,
        business_id: business_id || undefined,
      })
      return reply || "Done."
    }

    if (response.stop_reason !== "tool_use") {
      // Unexpected stop reason (max_tokens, stop_sequence, refusal, etc.)
      logger.warn("Unexpected stop_reason", { stop_reason: response.stop_reason, user_id })
      return "Something went wrong, please try again."
    }

    const tool_use_blocks = response.content.filter(
      (block: Message["content"][number]): block is ToolUseBlock => block.type === "tool_use",
    )

    if (tool_use_blocks.length === 0) {
      logger.error("stop_reason=tool_use but no tool_use blocks found", { user_id })
      return "Something went wrong, please try again."
    }

    tool_call_count += tool_use_blocks.length

    const tool_results: ToolResultBlockParam[] = []
    for (const tool_block of tool_use_blocks) {
      const { block, resolved_business_id } = use_block(
        business_id,
        user_id,
        current_time_ms,
        sender_key,
        tool_block,
      )
      tool_results.push(block)
      if (resolved_business_id) {
        business_id = resolved_business_id
      }
    }
    history.push({ role: "user", content: tool_results })
  }
}
