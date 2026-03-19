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

const VALID_DOMAINS = ["restaurant", "doctor", "salon"]

const try_check_availability = (
  domain: string,
  date: string,
  time: string,
  party_size: number,
): tool_result_type => {
  try {
    const slot = queries.check_availability(domain, date, time, party_size)
    if (!slot) {
      return {
        ok: false,
        error: `No availability for ${domain} on ${date} at ${time} for ${party_size} ${party_size === 1 ? "person" : "people"}.`,
      }
    }
    return {
      ok: true,
      data: {
        slot_id: slot.id,
        domain: slot.domain,
        date: slot.date,
        time: slot.time,
        available_capacity: slot.capacity - slot.booked,
      },
    }
  } catch (err) {
    logger.error("check_availability query failed", { err: String(err) })
    return { ok: false, error: "Failed to check availability. Please try again." }
  }
}

export const handle_check_availability = (
  input: check_availability_input_type,
): tool_result_type => {
  const { domain, date, time, party_size = 1 } = input

  if (!VALID_DOMAINS.includes(domain)) {
    return {
      ok: false,
      error: `Invalid domain "${domain}". Must be one of: restaurant, doctor, salon.`,
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: `Invalid date format "${date}". Use YYYY-MM-DD.` }
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, error: `Invalid time format "${time}". Use HH:MM.` }
  }

  if (party_size < 1) {
    return { ok: false, error: "Party size must be at least 1." }
  }

  return try_check_availability(domain, date, time, party_size)
}

const try_create_booking = (
  user_id: number,
  slot_id: number,
  party_size: number,
  current_time_ms: number,
  domain: string,
  notes: string | undefined,
): tool_result_type => {
  try {
    const reservation = queries.create_reservation(
      user_id,
      slot_id,
      party_size,
      current_time_ms,
      domain,
      notes,
    )
    const slot = queries.get_slot_by_id(slot_id)
    return {
      ok: true,
      data: {
        reservation_id: reservation.id,
        domain: reservation.domain,
        date: slot?.date ?? "",
        time: slot?.time ?? "",
        party_size: reservation.party_size,
        status: reservation.status,
        notes: reservation.notes ?? null,
      },
    }
  } catch (err) {
    if (
      err instanceof queries.capacity_error ||
      err instanceof queries.slot_not_found_error ||
      err instanceof queries.slot_domain_mismatch_error
    ) {
      return { ok: false, error: err.message }
    }
    logger.error("create_booking failed", { err: String(err), user_id, slot_id })
    return { ok: false, error: "Failed to create booking. Please try again." }
  }
}

export const handle_create_booking = (
  user_id: number,
  current_time_ms: number,
  input: create_booking_input_type,
): tool_result_type => {
  const { slot_id, domain, party_size = 1, notes } = input

  if (!VALID_DOMAINS.includes(domain)) {
    return {
      ok: false,
      error: `Invalid domain "${domain}". Must be one of: restaurant, doctor, salon.`,
    }
  }

  if (party_size < 1) {
    return { ok: false, error: "Party size must be at least 1." }
  }

  return try_create_booking(user_id, slot_id, party_size, current_time_ms, domain, notes)
}

export const handle_list_bookings = (
  user_id: number,
  _input: list_bookings_input_type,
): tool_result_type => {
  try {
    const rows = queries.list_reservations(user_id)
    return {
      ok: true,
      data: {
        reservations: rows.map((r) => ({
          reservation_id: r.id,
          domain: r.domain,
          party_size: r.party_size,
          status: r.status,
          notes: r.notes ?? null,
          created_at: r.created_at,
        })),
      },
    }
  } catch (err) {
    logger.error("list_bookings failed", { err: String(err), user_id })
    return { ok: false, error: "Failed to retrieve reservations. Please try again." }
  }
}

export const handle_get_booking = (
  _user_id: number,
  _input: get_booking_input_type,
): tool_result_type => {
  return { ok: false, error: "get_booking is not yet implemented." }
}

export const handle_cancel_booking = (
  _user_id: number,
  _input: cancel_booking_input_type,
): tool_result_type => {
  return { ok: false, error: "cancel_booking is not yet implemented." }
}

export const handle_reschedule_booking = (
  _user_id: number,
  _input: reschedule_booking_input_type,
): tool_result_type => {
  return { ok: false, error: "reschedule_booking is not yet implemented." }
}
