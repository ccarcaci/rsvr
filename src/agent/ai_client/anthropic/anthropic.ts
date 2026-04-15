import Anthropic, { type APIPromise } from "@anthropic-ai/sdk"
import type { Message, MessageParam } from "@anthropic-ai/sdk/resources"
import { get_system_prompt } from "../../prompts"
import { AGENT_TOOLS } from "../../tools"
import type { session_history_entry_type } from "../../types"

let cached_client: Anthropic | null = null

const MODEL = "claude-opus-4-5"

const get_anthropic_client = (): Anthropic => {
  if (!cached_client) {
    throw new Error("Anthropic client not initialized. Call init_anthropic_client() first.")
  }
  return cached_client
}

//  --

export const message_conversation = (
  current_time_ms: number,
  history: session_history_entry_type[],
): APIPromise<Message> => {
  const client = get_anthropic_client()
  return client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: get_system_prompt(current_time_ms),
    tools: AGENT_TOOLS,
    messages: history as MessageParam[],
  })
}

export const init_anthropic_client = (api_key: string): void => {
  cached_client = new Anthropic({ apiKey: api_key })
}
