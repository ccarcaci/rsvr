import Anthropic from "@anthropic-ai/sdk"
import type { Message, MessageParam } from "@anthropic-ai/sdk/resources"
import { trace } from "../../../tracer/tracing"
import { get_system_prompt } from "../../prompts"
import { AGENT_TOOLS } from "../../tools"
import { anthropic_api_message_type } from "./types"

let cached_client: Anthropic | null = null

const MODEL = "claude-opus-4-5"

const get_anthropic_client = (): Anthropic => {
  if (!cached_client) {
    throw new Error("Anthropic client not initialized. Call init_anthropic_client() first.")
  }
  return cached_client
}

export const convert_message_to_message_param = (message: Message | MessageParam): MessageParam => ({
  role: message.role,
  content: message.content,
})

//  --

export const message_conversation =  async (
  current_time_ms: number,
  history: anthropic_api_message_type[],
  ): Promise<anthropic_api_message_type> => {
  trace("src/agent/ai_client/anthropic/anthropic", "message_conversation", current_time_ms, history)
  const history_mp = history.map(convert_message_to_message_param)
  const client = get_anthropic_client()
  return client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: get_system_prompt(current_time_ms),
    tools: AGENT_TOOLS,
    messages: history_mp,
  })
}

export const init_anthropic_client = (api_key: string): void => {
  cached_client = new Anthropic({ apiKey: api_key })
}
