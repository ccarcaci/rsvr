import { logger } from "../shared/logger"
import { client } from "./client/anthropic"
import { INTENT_SYSTEM_PROMPT, build_intent_user_prompt } from "./prompts"
import type { intent_type } from "./types"

export const parse_intent = async (text: string): Promise<intent_type> => {
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
    const parsed = JSON.parse(content.text) as intent_type
    if (!parsed.action) {
      return { action: "unknown", raw_text: text }
    }
    return parsed
  } catch {
    logger.warn("Failed to parse intent JSON", { raw: content.text })
    return { action: "unknown", raw_text: text }
  }
}
