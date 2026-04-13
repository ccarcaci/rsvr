import { logger } from "../shared/logger"
import { get_openai_client } from "./client/openai"

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

//  --

export const transcribe_audio = async (
  buffer: Uint8Array<ArrayBuffer>,
  mime_type: string,
): Promise<string> => {
  const file = new File([buffer], `voice.${extension_from_mime(mime_type)}`, { type: mime_type })

  const openai_client = get_openai_client()
  const response = await openai_client.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file,
  })

  logger.debug("Transcription result", { text: response.text })
  return response.text
}
