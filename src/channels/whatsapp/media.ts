import type { whatsapp_client_type } from "./client"

export const download_voice_note = async (
  client: whatsapp_client_type,
  media_id: string,
): Promise<{ buffer: Uint8Array<ArrayBuffer>; mime_type: string }> => {
  const buffer = await client.download_media(media_id)
  return { buffer, mime_type: "audio/ogg" }
}
