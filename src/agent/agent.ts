import { logger } from "../shared/logger"
import { trace } from "../tracer/tracing"
import { prompt } from "./ai_client/ai_client"
import type { ai_client_prompt_result_type, tool_use_block_result_type } from "./types"
import { use_blocks } from "./use_blocks/use_blocks"

const MAX_TOOL_CALLS = 10

//  --

export const run_agent = async (
  current_time_ms: number,
  sender_key: string,
  text: string,
): Promise<string> => {
  trace("src/agent/agent", "run_agent", current_time_ms, sender_key, text)

  let next_stage_input: string | tool_use_block_result_type[] = text
  let tool_call_count = 0
  while (true) {
    if (tool_call_count >= MAX_TOOL_CALLS) {
      logger.error("Agent exceeded max tool calls", { sender_key, tool_call_count })
      return "Something went wrong, please try again."
    }

    const prompt_response: ai_client_prompt_result_type = await prompt(
      current_time_ms,
      sender_key,
      next_stage_input,
    )

    if (prompt_response.stop_reason === "end_turn") {
      return prompt_response.text_block || "Done."
    }

    if (prompt_response.stop_reason !== "tool_use") {
      // Unexpected stop reason (max_tokens, stop_sequence, refusal, etc.)
      logger.warn("Unexpected stop_reason", { stop_reason: prompt_response.stop_reason })
      return "Something went wrong, please try again."
    }

    tool_call_count += prompt_response.use_blocks.length
    next_stage_input = use_blocks(current_time_ms, prompt_response.use_blocks)
  }
}
