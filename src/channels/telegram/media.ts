import type { Api } from "grammy"
import { trace } from "../../tracer/tracing"

export const download_voice_note = async (
  file_id: string,
  api: Api,
): Promise<{ buffer: Uint8Array<ArrayBuffer>; mime_type: string }> => {
  trace("src/channels/telegram/media", "download_voice_note", file_id)
  const file = await api.getFile(file_id)
  const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download Telegram voice note: ${response.status}`)
  }

  return {
    buffer: new Uint8Array(await response.arrayBuffer()),
    mime_type: "audio/ogg",
  }
}
