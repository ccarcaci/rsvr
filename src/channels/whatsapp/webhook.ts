import { Hono } from "hono"
import type { config } from "../../config/env"
import { logger } from "../../shared/logger"
import type { incoming_message, message_handler } from "../types"
import type { whatsapp_client } from "./client"
import { download_voice_note } from "./media"

interface whatsapp_webhook_entry {
  changes: Array<{
    value: {
      messages?: Array<{
        from: string
        type: string
        text?: { body: string }
        audio?: { id: string; mime_type: string }
      }>
      contacts?: Array<{ profile: { name: string } }>
    }
  }>
}

export const create_whatsapp_routes = (
  cfg: config,
  client: whatsapp_client,
  handler: message_handler,
): Hono => {
  const app = new Hono()

  app.get("/webhook/whatsapp", (c) => {
    const mode = c.req.query("hub.mode")
    const token = c.req.query("hub.verify_token")
    const challenge = c.req.query("hub.challenge")

    if (mode === "subscribe" && token === cfg.whatsapp_verify_token) {
      logger.info("WhatsApp webhook verified")
      return c.text(challenge ?? "", 200)
    }
    return c.text("Forbidden", 403)
  })

  app.post("/webhook/whatsapp", async (c) => {
    const body = await c.req.json()
    const entries = body.entry as whatsapp_webhook_entry[] | undefined

    if (!entries) return c.json({ status: "ok" })

    for (const entry of entries) {
      for (const change of entry.changes) {
        const messages = change.value.messages
        if (!messages) continue

        for (const msg of messages) {
          try {
            const incoming: incoming_message = {
              channel: "whatsapp",
              sender_id: msg.from,
              sender_name: change.value.contacts?.[0]?.profile.name,
              raw_payload: msg,
            }

            if (msg.type === "text" && msg.text) {
              incoming.text = msg.text.body
            } else if (msg.type === "audio" && msg.audio) {
              const voice = await download_voice_note(client, msg.audio.id)
              incoming.voice_buffer = voice.buffer
              incoming.voice_mime_type = voice.mime_type
            }

            const reply = await handler(incoming)
            await client.send_text_message(msg.from, reply)
          } catch (err) {
            logger.error("Error processing WhatsApp message", { error: err })
          }
        }
      }
    }

    return c.json({ status: "ok" })
  })

  return app
}
