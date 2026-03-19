import { logger } from "../shared/logger"
import { get_anthropic_client } from "./client/anthropic"
import { build_intent_user_prompt, INTENT_SYSTEM_PROMPT } from "./prompts"
import type { intent_type } from "./types"

const try_parse_intent_json = (json_text: string, original_text: string): intent_type => {
  try {
    const parsed = JSON.parse(json_text) as intent_type
    if (!parsed.action) {
      return { action: "unknown", raw_text: original_text }
    }
    return parsed
  } catch {
    logger.warn("Failed to parse intent JSON", { raw: json_text })
    return { action: "unknown", raw_text: original_text }
  }
}

export const parse_intent = async (text: string): Promise<intent_type> => {
  const today = new Date().toISOString().split("T")[0]

  const client = get_anthropic_client()
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

  return try_parse_intent_json(content.text, text)
}
