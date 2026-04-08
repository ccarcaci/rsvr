import * as queries from "../db/queries"
import { logger } from "../shared/logger"
import type {
  cancel_booking_input_type,
  check_availability_input_type,
  create_booking_input_type,
  get_booking_input_type,
  list_bookings_input_type,
  reschedule_booking_input_type,
  tool_result_type,
} from "./types"

const try_check_availability = (
  date: string,
  time: string,
  party_size: number,
): tool_result_type => {
  try {
    const slot = queries.check_availability(date, time, party_size)
    if (!slot) {
      return {
        status: "error",
        error: `No availability on ${date} at ${time} for ${party_size} ${party_size === 1 ? "person" : "people"}.`,
      }
    }
    return {
      status: "success",
      data: {
        slot_id: slot.id,
        date: slot.date,
        time: slot.time,
        available_capacity: slot.capacity - slot.booked,
      },
    }
  } catch (err) {
    logger.error("check_availability query failed", { err: String(err) })
    return { status: "error", error: "Failed to check availability. Please try again." }
  }
}

//  --

const INVALID_PARTY_SIZE: tool_result_type = {
  status: "error",
  error: "Party size must be at least 1.",
}

export const handle_check_availability = (
  input: check_availability_input_type,
): tool_result_type => {
  const { date, time, party_size = 1 } = input

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { status: "error", error: `Invalid date format "${date}". Use YYYY-MM-DD.` }
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { status: "error", error: `Invalid time format "${time}". Use HH:MM.` }
  }

  if (party_size < 1) {
    return INVALID_PARTY_SIZE
  }

  return try_check_availability(date, time, party_size)
}

//  --

const try_create_booking = (
  user_id: number,
  slot_id: number,
  party_size: number,
  current_time_ms: number,
  notes: string | undefined,
): tool_result_type => {
  try {
    const reservation = queries.create_reservation(
      user_id,
      slot_id,
      party_size,
      current_time_ms,
      notes,
    )
    const slot = queries.get_slot_by_id(slot_id)
    return {
      status: "success",
      data: {
        reservation_id: reservation.id,
        date: slot?.date ?? "",
        time: slot?.time ?? "",
        party_size: reservation.party_size,
        status: reservation.status,
        notes: reservation.notes ?? null,
      },
    }
  } catch (err) {
    if (err instanceof queries.capacity_error || err instanceof queries.slot_not_found_error) {
      return { status: "error", error: err.message }
    }
    logger.error("create_booking failed", { err: String(err), user_id, slot_id })
    return { status: "error", error: "Failed to create booking. Please try again." }
  }
}

//  --

export const handle_create_booking = (
  user_id: number,
  current_time_ms: number,
  input: create_booking_input_type,
): tool_result_type => {
  const { slot_id, party_size = 1, notes } = input

  if (party_size < 1) {
    return INVALID_PARTY_SIZE
  }

  // Validate notes length to prevent unbounded storage and LLM-generated text exploitation
  const MAX_NOTES_LENGTH = 500
  if (notes && notes.length > MAX_NOTES_LENGTH) {
    return {
      status: "error",
      error: `Notes must not exceed ${MAX_NOTES_LENGTH} characters (provided: ${notes.length}).`,
    }
  }

  return try_create_booking(user_id, slot_id, party_size, current_time_ms, notes)
}

//  --

export const handle_list_bookings = (
  user_id: number,
  _input: list_bookings_input_type,
): tool_result_type => {
  try {
    const rows = queries.list_reservations(user_id)
    return {
      status: "success",
      data: {
        reservations: rows.map((r) => ({
          reservation_id: r.id,
          party_size: r.party_size,
          status: r.status,
          notes: r.notes ?? null,
          created_at: r.created_at,
        })),
      },
    }
  } catch (err) {
    logger.error("list_bookings failed", { err: String(err), user_id })
    return { status: "error", error: "Failed to retrieve reservations. Please try again." }
  }
}

//  --

export const handle_get_booking = (
  _user_id: number,
  _input: get_booking_input_type,
): tool_result_type => {
  return { status: "error", error: "get_booking is not yet implemented." }
}

//  --

export const handle_cancel_booking = (
  user_id: number,
  input: cancel_booking_input_type,
): tool_result_type => {
  const { reservation_id } = input

  try {
    const cancelled = queries.cancel_reservation(user_id, reservation_id)
    if (!cancelled) {
      return {
        status: "error",
        error: "Reservation not found or already cancelled. Only the reservation owner can cancel.",
      }
    }
    return {
      status: "success",
      data: {
        reservation_id,
        status: "cancelled",
      },
    }
  } catch (err) {
    logger.error("cancel_booking failed", { err: String(err), user_id, reservation_id })
    return { status: "error", error: "Failed to cancel booking. Please try again." }
  }
}

//  --

export const handle_reschedule_booking = (
  _user_id: number,
  _input: reschedule_booking_input_type,
): tool_result_type => {
  return { status: "error", error: "reschedule_booking is not yet implemented." }
}
