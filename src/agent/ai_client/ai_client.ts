import type { Message, ToolUseBlock } from "@anthropic-ai/sdk/resources"
import type { ai_client_prompt_result_type, session_history_entry_type } from "../types"
import { message_conversation } from "./anthropic/anthropic"

const deserialize_message = (message: Message): ai_client_prompt_result_type => {
  const tb = message.content.find((block: Message["content"][number]) => block.type === "text")
  const ubs = message.content.filter(
    (block: Message["content"][number]) => block.type === "tool_use",
  )
  return {
    stop_reason: message.stop_reason ?? "",
    text_block: tb?.text ?? "",
    use_blocks: ubs.map((ub: ToolUseBlock) => ({
      id: ub.id,
      name: ub.name,
      input: ub.input,
    })),
    feedback_content: message.content,
  }
}

//  --

export const prompt = async (
  current_time_ms: number,
  history: session_history_entry_type[],
): Promise<ai_client_prompt_result_type> => {
  const message = await message_conversation(current_time_ms, history)
  return deserialize_message(message)
}
