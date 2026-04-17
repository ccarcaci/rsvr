import { logger } from "../shared/logger"
import { prompt } from "./ai_client/ai_client"
import { get_session, update_session } from "./session"
import type {
  ai_client_prompt_result_type,
  retrieve_business_id_content_type,
  session_entry_type,
  session_history_entry_type,
  tool_use_block_result_success_type,
  tool_use_block_result_type,
} from "./types"
import { use_blocks } from "./use_blocks/use_blocks"

const MAX_TOOL_CALLS = 10

//  --

const handle_end_turn = (
  current_time_ms: number,
  business_id: string,
  sender_key: string,
  text_block: string,
  session: session_entry_type,
  history: session_history_entry_type[],
): string => {
  update_session(current_time_ms, sender_key, {
    ...session,
    history,
    business_id: business_id || undefined,
  })
  return text_block || "Done."
}

const refresh_session = (
  current_time_ms: number,
  sender_key: string,
  current_business_id: string,
  session: session_entry_type,
  tool_results: tool_use_block_result_type[],
  history: session_history_entry_type[],
) => {
  history.push({ role: "user", content: tool_results })
  update_session(current_time_ms, sender_key, {
    ...session,
    history,
    business_id: current_business_id || undefined,
  })
}

const extract_business_id_from_tools = (
  current_business_id: string,
  tool_results: tool_use_block_result_type[],
): string => {
  if (current_business_id !== "") {
    return current_business_id
  }

  const resolve_business_id_tool = tool_results
    .filter((tr: tool_use_block_result_type) => tr.status === "success")
    .find(
      (tr: tool_use_block_result_success_type) =>
        tr.data.tool_use_id === "handle_retrieve_busines_id" &&
        "resolved_business_id" in tr.data.content,
    ) as retrieve_business_id_content_type | undefined

  if (resolve_business_id_tool === undefined) {
    return ""
  }

  return resolve_business_id_tool.resolved_business_id
}

//  --

export const run_agent = async (
  current_time_ms: number,
  user_id: string,
  sender_key: string,
  text: string,
): Promise<string> => {
  const session = get_session(sender_key, current_time_ms)
  let current_business_id = session.business_id ?? ""

  const history: session_history_entry_type[] = [
    ...session.history,
    { role: "user", content: text },
  ]

  let tool_call_count = 0
  while (true) {
    if (tool_call_count >= MAX_TOOL_CALLS) {
      logger.error("Agent exceeded max tool calls", { user_id, sender_key, tool_call_count })
      return "Something went wrong, please try again."
    }

    const prompt_response: ai_client_prompt_result_type = await prompt(current_time_ms, history)

    history.push({ role: "assistant", content: prompt_response.feedback_content })

    if (prompt_response.stop_reason === "end_turn") {
      return handle_end_turn(
        current_time_ms,
        current_business_id,
        sender_key,
        prompt_response.text_block,
        session,
        history,
      )
    }

    if (prompt_response.stop_reason !== "tool_use") {
      // Unexpected stop reason (max_tokens, stop_sequence, refusal, etc.)
      logger.warn("Unexpected stop_reason", { stop_reason: prompt_response.stop_reason, user_id })
      return "Something went wrong, please try again."
    }

    tool_call_count += prompt_response.use_blocks.length

    const tool_results = use_blocks(
      current_time_ms,
      current_business_id,
      user_id,
      prompt_response.use_blocks,
    )
    current_business_id = extract_business_id_from_tools(current_business_id, tool_results)

    refresh_session(
      current_time_ms,
      sender_key,
      current_business_id,
      session,
      tool_results,
      history,
    )
  }
}
