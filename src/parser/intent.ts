import Anthropic from "@anthropic-ai/sdk"
import { logger } from "../shared/logger"
import { INTENT_SYSTEM_PROMPT, build_intent_user_prompt } from "./prompts"
import type { intent } from "./types"

let client: Anthropic

export const init_intent_parser = (api_key_or_client: string | Anthropic): void => {
  if (typeof api_key_or_client === "string") {
    client = new Anthropic({ apiKey: api_key_or_client })
  } else {
    client = api_key_or_client
  }
}

export const parse_intent = async (text: string): Promise<intent> => {
  if (!client) {
    throw new Error("intent parser not initialized. Call init_intent_parser() first.")
  }

  const today = new Date().toISOString().split("T")[0]

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: INTENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: build_intent_user_prompt(text, today) }],
  })

  const content = response.content[0]
  if (content.type !== "text") {
    return { action: "unknown", raw_text: text }
  }

  try {
    const parsed = JSON.parse(content.text) as intent
    if (!parsed.action) {
      return { action: "unknown", raw_text: text }
    }
    return parsed
  } catch {
    logger.warn("Failed to parse intent JSON", { raw: content.text })
    return { action: "unknown", raw_text: text }
  }
}
