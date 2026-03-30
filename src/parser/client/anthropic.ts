import Anthropic from "@anthropic-ai/sdk"
import type { MessageParam } from "@anthropic-ai/sdk/resources"
import { get_system_prompt } from "../../agent/prompts"
import { AGENT_TOOLS } from "../../agent/tools"

let cached_client: Anthropic | null = null

const MODEL = "claude-opus-4-5"

const get_anthropic_client = (): Anthropic => {
  if (!cached_client) {
    throw new Error("Anthropic client not initialized. Call init_anthropic_client() first.")
  }
  return cached_client
}

//  --

export const messages_create = (current_time_ms: number, history: MessageParam[]) => {
  const client = get_anthropic_client()
  return client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: get_system_prompt(current_time_ms),
    tools: AGENT_TOOLS,
    messages: history,
  })
}

export const init_anthropic_client = (api_key: string): void => {
  cached_client = new Anthropic({ apiKey: api_key })
}
