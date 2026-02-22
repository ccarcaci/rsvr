import type { config } from "../../config/env"
import { logger } from "../../shared/logger"

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0"

export const create_whatsapp_client = (cfg: config) => {
  const { whatsapp_access_token, whatsapp_phone_number_id } = cfg

  const send_text_message = async (to: string, text: string): Promise<void> => {
    const url = `${GRAPH_API_BASE}/${whatsapp_phone_number_id}/messages`
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsapp_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error("Failed to send WhatsApp message", { to, error })
      throw new Error(`WhatsApp send failed: ${response.status}`)
    }
  }

  const download_media = async (media_id: string): Promise<Buffer> => {
    const meta_url = `${GRAPH_API_BASE}/${media_id}`
    const meta_response = await fetch(meta_url, {
      headers: { Authorization: `Bearer ${whatsapp_access_token}` },
    })

    if (!meta_response.ok) {
      throw new Error(`Failed to get media URL: ${meta_response.status}`)
    }

    const meta = (await meta_response.json()) as { url: string }
    const media_response = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${whatsapp_access_token}` },
    })

    if (!media_response.ok) {
      throw new Error(`Failed to download media: ${media_response.status}`)
    }

    return Buffer.from(await media_response.arrayBuffer())
  }

  return { send_text_message, download_media }
}

export type whatsapp_client = ReturnType<typeof create_whatsapp_client>
