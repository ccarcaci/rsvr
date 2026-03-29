import { type } from "arktype"
import { logger } from "../../shared/logger"

//  --  Leaf schemas

export const whatsapp_text_schema = type({
  body: "string",
})

export const whatsapp_audio_schema = type({
  id: "string",
  mime_type: "string",
})

//  --  Message schema

export const whatsapp_message_schema = type({
  from: "string",
  type: "string",
  "text?": whatsapp_text_schema,
  "audio?": whatsapp_audio_schema,
})

export type whatsapp_message_schema_type = typeof whatsapp_message_schema.infer

//  --  Contact schema

export const whatsapp_contact_schema = type({
  profile: {
    name: "string",
  },
})

//  --  Change value schema

export const whatsapp_change_value_schema = type({
  "messages?": whatsapp_message_schema.array(),
  "contacts?": whatsapp_contact_schema.array(),
})

//  --  Entry schema

export const whatsapp_entry_schema = type({
  changes: type({
    value: whatsapp_change_value_schema,
  }).array(),
})

//  --  Webhook body schema (top-level)

export const whatsapp_webhook_body_schema = type({
  "entry?": whatsapp_entry_schema.array(),
})

export type whatsapp_webhook_body_schema_type = typeof whatsapp_webhook_body_schema.infer

//  --  Validation helper

export const parse_whatsapp_webhook_body = (raw: unknown): whatsapp_webhook_body_schema_type => {
  const result = whatsapp_webhook_body_schema(raw)
  if (result instanceof type.errors) {
    logger.warn("WhatsApp webhook body failed schema validation", {
      validation_error: result.summary,
    })
    throw new Error(result.summary)
  }
  return result
}
