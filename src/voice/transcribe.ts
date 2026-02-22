import OpenAI from "openai"
import { logger } from "../shared/logger"

let client: OpenAI

export const init_transcriber = (api_key: string): void => {
  client = new OpenAI({ apiKey: api_key })
}

export const transcribe_audio = async (buffer: Buffer, mime_type: string): Promise<string> => {
  if (!client) {
    throw new Error("Transcriber not initialized. Call init_transcriber() first.")
  }

  const file = new File([buffer], `voice.${extension_from_mime(mime_type)}`, { type: mime_type })

  const response = await client.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file,
  })

  logger.debug("Transcription result", { text: response.text })
  return response.text
}

const extension_from_mime = (mime: string): string => {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
  }
  return map[mime] ?? "ogg"
}
