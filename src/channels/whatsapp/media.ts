import type { whatsapp_client } from "./client"

export const download_voice_note = async (
  client: whatsapp_client,
  media_id: string,
): Promise<{ buffer: Buffer; mime_type: string }> => {
  const buffer = await client.download_media(media_id)
  return { buffer, mime_type: "audio/ogg" }
}
