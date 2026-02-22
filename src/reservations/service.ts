import type { incoming_message } from "../channels/types"
import * as db from "../db/queries"
import { parse_intent } from "../parser/intent"
import { is_cancel_intent, is_list_intent, is_reserve_intent } from "../parser/types"
import { logger } from "../shared/logger"
import { transcribe_audio } from "../voice/transcribe"

export const handle_message = async (message: incoming_message): Promise<string> => {
  let text = message.text

  if (!text && message.voice_buffer) {
    text = await transcribe_audio(message.voice_buffer, message.voice_mime_type ?? "audio/ogg")
    logger.info("Transcribed voice note", { text, sender: message.sender_id })
  }

  if (!text) {
    return "I can help you with reservations. Send me a text or voice message!"
  }

  const user = db.create_user(message.channel, message.sender_id, message.sender_name)

  const intent = await parse_intent(text)

  if (is_reserve_intent(intent)) {
    if (!intent.domain || !intent.date || !intent.time) {
      const missing: string[] = []
      if (!intent.domain) missing.push("type (restaurant, doctor, or salon)")
      if (!intent.date) missing.push("date")
      if (!intent.time) missing.push("time")
      return `I'd like to help you book. Could you provide: ${missing.join(", ")}?`
    }

    const party_size = intent.party_size ?? 1
    const slot = db.check_availability(intent.domain, intent.date, intent.time, party_size)

    if (!slot) {
      return `Sorry, no availability for ${intent.domain} on ${intent.date} at ${intent.time}. Would you like to try a different time?`
    }

    const reservation = db.create_reservation(
      user.id,
      slot.id,
      intent.domain,
      party_size,
      intent.notes,
    )

    return `Reservation confirmed! #${reservation.id} - ${intent.domain} on ${intent.date} at ${intent.time} for ${party_size} ${party_size === 1 ? "person" : "people"}.`
  }

  if (is_cancel_intent(intent)) {
    if (!intent.reservation_id) {
      return "Which reservation would you like to cancel? Please provide the reservation number."
    }

    const cancelled = db.cancel_reservation(intent.reservation_id)
    if (cancelled) {
      return `Reservation #${intent.reservation_id} has been cancelled.`
    }
    return `Could not find active reservation #${intent.reservation_id}.`
  }

  if (is_list_intent(intent)) {
    const reservations = db.list_reservations(user.id)
    if (reservations.length === 0) {
      return "You don't have any active reservations."
    }

    const list = reservations
      .map((r) => `#${r.id} - ${r.domain} on ${r.created_at} (${r.party_size} people)`)
      .join("\n")
    return `Your reservations:\n${list}`
  }

  return 'I can help you with reservations! You can:\n- Book a reservation (e.g. "Book a table for 2 tomorrow at 7pm")\n- Cancel a reservation (e.g. "Cancel reservation #123")\n- List your reservations (e.g. "Show my reservations")'
}
