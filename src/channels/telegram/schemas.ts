import { type } from "arktype"
import { logger } from "../../shared/logger"

//  --  Sender schema (Telegram "User" object subset)

export const telegram_from_schema = type({
  id: "number",
  first_name: "string",
  "last_name?": "string",
  "username?": "string",
})

export type telegram_from_schema_type = typeof telegram_from_schema.infer

//  --  Voice schema

export const telegram_voice_schema = type({
  file_id: "string",
  duration: "number",
  "mime_type?": "string",
  "file_size?": "number",
})

export type telegram_voice_schema_type = typeof telegram_voice_schema.infer

//  --  Text message schema

export const telegram_text_message_schema = type({
  message_id: "number",
  text: "string",
  from: telegram_from_schema,
})

export type telegram_text_message_schema_type = typeof telegram_text_message_schema.infer

//  --  Voice message schema

export const telegram_voice_message_schema = type({
  message_id: "number",
  voice: telegram_voice_schema,
  from: telegram_from_schema,
})

export type telegram_voice_message_schema_type = typeof telegram_voice_message_schema.infer

//  --  Context shape for text and voice handlers
//      grammY passes the full context; we validate only the fields we consume.

export const telegram_text_ctx_schema = type({
  from: telegram_from_schema,
  message: telegram_text_message_schema,
})

export type telegram_text_ctx_schema_type = typeof telegram_text_ctx_schema.infer

export const telegram_voice_ctx_schema = type({
  from: telegram_from_schema,
  message: telegram_voice_message_schema,
})

export type telegram_voice_ctx_schema_type = typeof telegram_voice_ctx_schema.infer

//  --  Validation helpers

export const parse_telegram_text_ctx = (raw: unknown): telegram_text_ctx_schema_type => {
  const result = telegram_text_ctx_schema(raw)
  if (result instanceof type.errors) {
    logger.warn("Telegram text ctx failed schema validation", { validation_error: result.summary })
    throw new Error(result.summary)
  }
  return result
}

export const parse_telegram_voice_ctx = (raw: unknown): telegram_voice_ctx_schema_type => {
  const result = telegram_voice_ctx_schema(raw)
  if (result instanceof type.errors) {
    logger.warn("Telegram voice ctx failed schema validation", { validation_error: result.summary })
    throw new Error(result.summary)
  }
  return result
}
