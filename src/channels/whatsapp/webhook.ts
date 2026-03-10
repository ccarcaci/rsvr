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

const create_whatsapp_routes = (): Hono => {
  const app = new Hono()

  app.get("/webhook/whatsapp", (c) => {
    const mode = c.req.query("hub.mode")
    const token = c.req.query("hub.verify_token")
    const challenge = c.req.query("hub.challenge")
    return whatsapp_verify_challenge(c, mode, token, challenge)
  })

  app.post("/webhook/whatsapp", async (c) => {
    const body = await c.req.json()
    const entries = body.entry as whatsapp_webhook_entry_type[] | undefined

    if (!entries) return c.json({ status: "ok" })

    const messages_values = entries
      ?.flatMap((e) => e.changes)
      .map((c) => c.value)
      .filter((v) => v.messages !== undefined)
    const contact = messages_values[0].contacts?.[0]?.profile.name
    const messages = messages_values.flatMap((mv) => mv.messages) as whatsapp_message_type[] // because undefined messages have been filtere out above

    try {
      whatsapp_messages_handler(messages, contact)
    } catch (err) {
      logger.error("Error processing WhatsApp message", { error: err })
    }
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

const whatsapp_messages_handler = (messages: whatsapp_message_type[], contact?: string) => {
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
      const voice = await download_voice_note(whatsapp_client, msg.audio.id)
      incoming.voice_buffer = voice.buffer
      incoming.voice_mime_type = voice.mime_type
    }

    const reply = await handle_message(incoming)
    await whatsapp_client.send_text_message(msg.from, reply)
  })
}

//  --

export const whatsapp_routes = create_whatsapp_routes()
