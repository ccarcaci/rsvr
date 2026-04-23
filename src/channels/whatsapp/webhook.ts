import { timingSafeEqual } from "node:crypto"
import { type Context, Hono, type MiddlewareHandler } from "hono"
import { configs } from "../../config/args"
import { handle_message } from "../../reservations/service"
import { logger } from "../../shared/logger"
import { trace } from "../../tracer/tracing"
import type { incoming_message_type } from "../types"
import { whatsapp_client } from "./client"
import { download_voice_note } from "./media"
import {
  parse_whatsapp_webhook_body,
  type whatsapp_message_schema_type,
  type whatsapp_webhook_body_schema_type,
} from "./schemas"

const MAX_WEBHOOK_BODY_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_MESSAGES_PER_SENDER_PER_MINUTE = 60 // Rate limit: max 60 messages per sender per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const MAX_RATE_LIMIT_CACHE_SIZE = 10000 // LRU eviction when exceeds this

type sender_rate_limit_entry = { count: number; window_start_ms: number }
const sender_rate_limits = new Map<string, sender_rate_limit_entry>()

type whatsapp_webhook_variables_type = { whatsapp_parsed_body: whatsapp_webhook_body_schema_type }

const parse_and_validate_whatsapp_body = (raw_body: string): whatsapp_webhook_body_schema_type => {
  trace("parse_and_validate_whatsapp_body")
  let parsed: unknown
  try {
    parsed = JSON.parse(raw_body)
  } catch {
    logger.warn("WhatsApp webhook: invalid JSON body")
    throw new Error("Invalid JSON")
  }

  return parse_whatsapp_webhook_body(parsed)
}

const create_whatsapp_body_validation_middleware =
  // biome-ignore lint/style/useNamingConvention: Variables is defined in Hono
  (): MiddlewareHandler<{ Variables: whatsapp_webhook_variables_type }> => async (c, next) => {
    // Check Content-Length header before reading body to prevent memory exhaustion
    const content_length_str = c.req.header("Content-Length")
    if (!content_length_str) {
      logger.warn("WhatsApp webhook: missing Content-Length header")
      return c.text("Bad Request", 400)
    }

    const content_length = parseInt(content_length_str, 10)
    if (Number.isNaN(content_length) || content_length > MAX_WEBHOOK_BODY_SIZE) {
      logger.warn(
        `WhatsApp webhook: request body too large (${content_length} bytes, limit ${MAX_WEBHOOK_BODY_SIZE})`,
      )
      return c.text("Payload Too Large", 413)
    }

    // Read raw body once — required for signature verification before JSON parsing.
    const raw_body = await c.req.text()

    // Defense-in-depth: verify actual body size matches Content-Length header
    // (protects against attacker tampering with header)
    if (raw_body.length !== content_length) {
      logger.warn(
        `WhatsApp webhook: Content-Length mismatch (header: ${content_length}, actual: ${raw_body.length})`,
      )
      return c.text("Bad Request", 400)
    }

    if (!verify_whatsapp_signature(c.req.header("X-Hub-Signature-256"), raw_body)) {
      logger.warn("WhatsApp webhook: signature verification failed")
      return c.text("Forbidden", 403)
    }

    // Parse and validate webhook body
    try {
      const body = parse_and_validate_whatsapp_body(raw_body)
      c.set("whatsapp_parsed_body", body)
      await next()
    } catch (err) {
      logger.warn("WhatsApp webhook: body validation failed", { error: err })
      return c.text("Bad Request", 400)
    }
  }

const try_handle_whatsapp_messages = async (
  messages: whatsapp_message_schema_type[],
  contact: string | undefined,
): Promise<void> => {
  trace("try_handle_whatsapp_messages", messages, contact)
  try {
    await whatsapp_messages_handler(messages, contact)
  } catch (err) {
    logger.error("Error processing WhatsApp messages batch", { error: err })
  }
}

const create_whatsapp_routes = (): Hono => {
  const app = new Hono()

  app.use("/webhook/whatsapp", create_whatsapp_body_validation_middleware())

  app.get("/webhook/whatsapp", (c) => {
    const mode = c.req.query("hub.mode")
    const token = c.req.query("hub.verify_token")
    const challenge = c.req.query("hub.challenge")
    return whatsapp_verify_challenge(c, mode, token, challenge)
  })

  app.post(
    "/webhook/whatsapp",
    // biome-ignore lint/style/useNamingConvention: Variables is defined in Hono
    async (c: Context<{ Variables: whatsapp_webhook_variables_type }>) => {
      trace("[POST] /webhook/whatsapp")
      const body = c.get("whatsapp_parsed_body")

      const entries = body.entry
      if (!entries) return c.json({ status: "ok" })

      const all_values = entries.flatMap((e) => e.changes).map((ch) => ch.value)
      const messages_values = all_values.filter(
        (v): v is typeof v & { messages: whatsapp_message_schema_type[] } =>
          v.messages !== undefined,
      )
      const contact = all_values[0]?.contacts?.[0]?.profile.name
      const messages = messages_values.flatMap((mv) => mv.messages)

      await try_handle_whatsapp_messages(messages, contact)
      return c.json({ status: "ok" })
    },
  )

  return app
}

//  --

const whatsapp_verify_challenge = (
  c: Context,
  mode?: string,
  token?: string,
  challenge?: string,
) => {
  trace("whatsapp_verify_challenge", mode, challenge)
  if (mode !== "subscribe" || challenge === undefined) {
    return c.text("Forbidden", 403)
  }

  // Verify token using timing-safe comparison to prevent timing attacks
  const token_match =
    token && timingSafeEqual(Buffer.from(token), Buffer.from(configs.whatsapp_verify_token))
  if (!token_match) {
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

  // Validate hex format: must be exactly 64 valid hex characters (SHA256 is 256 bits = 64 hex chars)
  const hex_pattern = /^[0-9a-f]{64}$/i
  if (!hex_pattern.test(received_hex)) return false

  const hasher = new Bun.CryptoHasher("sha256", configs.whatsapp_app_secret)
  hasher.update(raw_body)

  // Compare binary directly (avoid hex string allocation and round-trip conversion)
  // received_hex is validated to be exactly 64 valid hex characters
  const received_buf = Buffer.from(received_hex, "hex")
  const computed_digest = hasher.digest() // digest() returns Uint8Array of raw bytes
  const computed_buf = Buffer.from(
    computed_digest.buffer,
    computed_digest.byteOffset,
    computed_digest.byteLength,
  )

  return timingSafeEqual(received_buf, computed_buf)
}

//  --

const evict_oldest_rate_limit_entry = (): void => {
  trace("evict_oldest_rate_limit_entry")
  let oldest_sender_id: string | null = null
  let oldest_time = Infinity

  for (const [sender_id, entry] of sender_rate_limits) {
    if (entry.window_start_ms < oldest_time) {
      oldest_time = entry.window_start_ms
      oldest_sender_id = sender_id
    }
  }

  if (oldest_sender_id) {
    sender_rate_limits.delete(oldest_sender_id)
  }
}

const check_rate_limit = (sender_id: string, current_time_ms: number): boolean => {
  trace("check_rate_limit", current_time_ms, sender_id)
  const existing = sender_rate_limits.get(sender_id)

  // No entry or window expired — start new window
  if (!existing || current_time_ms - existing.window_start_ms >= RATE_LIMIT_WINDOW_MS) {
    // Evict oldest entry if cache at max size (LRU eviction)
    if (sender_rate_limits.size >= MAX_RATE_LIMIT_CACHE_SIZE && !existing) {
      evict_oldest_rate_limit_entry()
    }

    sender_rate_limits.set(sender_id, { count: 1, window_start_ms: current_time_ms })
    return true
  }

  // Within window — check if under limit
  if (existing.count < MAX_MESSAGES_PER_SENDER_PER_MINUTE) {
    existing.count += 1
    return true
  }

  // Limit exceeded
  return false
}

//  --

const try_process_single_message = async (
  msg: whatsapp_message_schema_type,
  contact: string | undefined,
  current_time_ms: number,
): Promise<void> => {
  trace("try_process_single_message", msg, contact, current_time_ms)
  try {
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

    const reply = await handle_message(current_time_ms, incoming)
    await whatsapp_client.send_text_message(msg.from, reply)
  } catch (err) {
    logger.error(`Error processing WhatsApp message from ${msg.from}`, { error: err })
  }
}

//  --

const whatsapp_messages_handler = async (
  messages: whatsapp_message_schema_type[],
  contact?: string,
): Promise<void> => {
  trace("whatsapp_message_handler", messages, contact)
  const current_time_ms = Date.now()

  // Process messages sequentially with bounded concurrency
  for (const msg of messages ?? []) {
    // Check rate limit before processing
    if (!check_rate_limit(msg.from, current_time_ms)) {
      logger.warn(`WhatsApp: rate limit exceeded for sender ${msg.from}`)
      continue
    }

    await try_process_single_message(msg, contact, current_time_ms)
  }
}

//  --

export const whatsapp_routes = create_whatsapp_routes()
