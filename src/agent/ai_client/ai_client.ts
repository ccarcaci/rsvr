import type { Message, MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources"
import { trace } from "../../tracer/tracing"
import type {
  ai_client_prompt_result_type,
  tool_use_block_request_type,
  tool_use_block_result_type,
} from "../types"
import { message_conversation } from "./anthropic/anthropic"
import { add_message_to_session, find_session } from "./session/session"

const deserialize_message = (message: Message): ai_client_prompt_result_type => {
  trace("src/agent/ai_client/ai_client", "deserialize_message", message)
  const tb = message.content.find((block: Message["content"][number]) => block.type === "text")
  const ubs = message.content.filter(
    (block: Message["content"][number]) => block.type === "tool_use",
  )
  return {
    stop_reason: message.stop_reason ?? "",
    text_block: tb?.text ?? "",
    use_blocks: ubs.map(
      (ub: ToolUseBlock) =>
        ({
          id: ub.id,
          name: ub.name,
          input: ub.input,
        }) as tool_use_block_request_type,
    ),
  }
}

const serialize_input = (input: string | tool_use_block_result_type[]): MessageParam => {
  if(typeof input === "string") {
    return {
      role: "user",
      content: input,
    }
  }
  return {
    role: "user",
    content: input.map((ub: tool_use_block_result_type) => {
      if (ub.status === "error") {
        return {
          tool_use_id: ub.id,
          type: "tool_result",
          is_error: true,
          content: ub.error,
        }
      }
      return {
        tool_use_id: ub.id,
        type: "tool_result",
        content: JSON.stringify(ub),
      }
    })
  }
}

//  --

export const prompt = async (
  current_time_ms: number,
  sender_key: string,
  input: string | tool_use_block_result_type[],
): Promise<ai_client_prompt_result_type> => {
  trace("src/agent/ai_client/ai_client", "prompt", current_time_ms, sender_key)

  const serialized_input = serialize_input(input)
  add_message_to_session(current_time_ms, sender_key, serialized_input)

  const session_history = find_session(current_time_ms, sender_key)

  const message = await message_conversation(current_time_ms, session_history.history)
  add_message_to_session(current_time_ms, sender_key, message)
  return deserialize_message(message)
}
