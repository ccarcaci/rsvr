import { run_agent } from "../agent/agent"
import type { incoming_message_type } from "../channels/types"
import * as db from "../db/queries"
import { logger } from "../shared/logger"
import { transcribe_audio } from "../voice/transcribe"

export const handle_message = async (
  current_time_ms: number,
  message: incoming_message_type,
): Promise<string> => {
  let text = message.text

  if (!text && message.voice_buffer) {
    text = await transcribe_audio(message.voice_buffer, message.voice_mime_type ?? "audio/ogg")
    logger.info("Transcribed voice note", { sender: message.sender_id })
  }

  if (!text) {
    return "I can help you with reservations. Send me a text or voice message!"
  }

  const user = db.create_user(message.channel, message.sender_id, message.sender_name)

  const sender_key = `${message.channel}:${message.sender_id}`

  return run_agent(user.id, current_time_ms, sender_key, text)
}
