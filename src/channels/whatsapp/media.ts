import { trace } from "../../tracer/tracing"
import type { whatsapp_client_type } from "./client"

export const download_voice_note = async (
  media_id: string,
  client: whatsapp_client_type,
): Promise<{ buffer: Uint8Array<ArrayBuffer>; mime_type: string }> => {
  trace("src/channels/whatsapp/media", "download_voice_note", media_id)
  const buffer = await client.download_media(media_id)
  return { buffer, mime_type: "audio/ogg" }
}
