import { timingSafeEqual } from "node:crypto"
import { type Context, Hono } from "hono"
import { configs } from "../../config/args"
import { handle_message } from "../../reservations/service"
import { logger } from "../../shared/logger"
import type { incoming_message_type } from "../types"
import { whatsapp_client } from "./client"
import { download_voice_note } from "./media"

type whatsapp_webhook_entry_type = {
  changes: {
    value: {
      messages?: whatsapp_message_type[]
      contacts?: whatsapp_contact_type[]
    }
  }[]
}

type whatsapp_message_type = {
  from: string
  type: string
  text?: { body: string }
  audio?: { id: string; mime_type: string }
}

type whatsapp_contact_type = { profile: { name: string } }

const try_parse_webhook_body = (
  raw_body: string,
): { entry?: whatsapp_webhook_entry_type[] } | null => {
  try {
    return JSON.parse(raw_body)
  } catch {
    logger.warn("WhatsApp webhook: invalid JSON body")
    return null
  }
}

const try_handle_whatsapp_messages = (
  messages: whatsapp_message_type[],
  contact: string | undefined,
): void => {
  try {
    whatsapp_messages_handler(messages, contact)
  } catch (err) {
    logger.error("Error processing WhatsApp message", { error: err })
  }
}

const create_whatsapp_routes = (): Hono => {
  const app = new Hono()

  app.get("/webhook/whatsapp", (c) => {
    const mode = c.req.query("hub.mode")
    const token = c.req.query("hub.verify_token")
    const challenge = c.req.query("hub.challenge")
    return whatsapp_verify_challenge(c, mode, token, challenge)
  })

  app.post("/webhook/whatsapp", async (c) => {
    // Read raw body once — required for signature verification before JSON parsing.
    const raw_body = await c.req.text()

    if (!verify_whatsapp_signature(c.req.header("X-Hub-Signature-256"), raw_body)) {
      logger.warn("WhatsApp webhook: signature verification failed")
      return c.text("Forbidden", 403)
    }

    const body = try_parse_webhook_body(raw_body)
    if (!body) {
      return c.text("Bad Request", 400)
    }

    const entries = body.entry
    if (!entries) return c.json({ status: "ok" })

    const messages_values = entries
      .flatMap((e) => e.changes)
      .map((ch) => ch.value)
      .filter((v) => v.messages !== undefined)
    const contact = messages_values[0]?.contacts?.[0]?.profile.name
    const messages = messages_values.flatMap((mv) => mv.messages) as whatsapp_message_type[] // undefined messages have been filtered out above

    try_handle_whatsapp_messages(messages, contact)
    return c.json({ status: "ok" })
  })

  return app
}

//  --

const whatsapp_verify_challenge = (
  c: Context,
  mode?: string,
  token?: string,
  challenge?: string,
) => {
  if (mode !== "subscribe" || token !== configs.whatsapp_verify_token || challenge === undefined) {
    return c.text("Forbidden", 403)
  }

  logger.info("WhatsApp webhook verified")
  return c.text(challenge ?? "", 200)
}

// Returns true only when the X-Hub-Signature-256 header matches the
// HMAC-SHA256 of the raw request body using the app secret as the key.
// Uses constant-time comparison to prevent timing attacks.
const verify_whatsapp_signature = (header: string | undefined, raw_body: string): boolean => {
  if (!header) return false

  // Header format: "sha256=<hex_digest>"
  const prefix = "sha256="
  if (!header.startsWith(prefix)) return false
  const received_hex = header.slice(prefix.length)

  const hasher = new Bun.CryptoHasher("sha256", configs.whatsapp_app_secret)
  hasher.update(raw_body)
  const computed_hex = hasher.digest("hex")

  // timingSafeEqual requires equal-length buffers — a length mismatch would
  // itself reveal information, so we reject before calling it.
  if (received_hex.length !== computed_hex.length) return false

  const received_buf = Buffer.from(received_hex, "hex")
  const computed_buf = Buffer.from(computed_hex, "hex")

  return timingSafeEqual(received_buf, computed_buf)
}

const whatsapp_messages_handler = (messages: whatsapp_message_type[], contact?: string) => {
  const current_time_ms = Date.now()
  messages?.forEach(async (msg) => {
    const incoming: incoming_message_type = {
      channel: "whatsapp",
      sender_id: msg.from,
      sender_name: contact,
      raw_payload: msg,
    }

    if (msg.type === "text" && msg.text) {
      incoming.text = msg.text.body
    } else if (msg.type === "audio" && msg.audio) {
      const voice = await download_voice_note(msg.audio.id, whatsapp_client)
      incoming.voice_buffer = voice.buffer
      incoming.voice_mime_type = voice.mime_type
    }

    const reply = await handle_message(incoming, current_time_ms)
    await whatsapp_client.send_text_message(msg.from, reply)
  })
}

//  --

export const whatsapp_routes = create_whatsapp_routes()
