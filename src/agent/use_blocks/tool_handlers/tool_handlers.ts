import {
  cancel_reservation,
  check_availability,
  create_reservation,
  find_businesses_by_name,
  find_reservation,
  find_reservations,
  find_slot_by_id,
} from "../../../db/queries"
import { capacity_error, slot_not_found_error } from "../../../db/types"
import { logger } from "../../../shared/logger"
import { trace } from "../../../tracer/tracing"
import type {
  cancel_reservation_input_type,
  check_availability_input_type,
  create_reservation_input_type,
  find_business_id_input_type,
  find_reservation_input_type,
  list_reservations_input_type,
  reschedule_reservation_input_type,
  tool_use_block_result_type,
} from "../../types"

const try_check_availability = (
  business_id: string,
  date: string,
  time: string,
  party_size: number,
): tool_use_block_result_type => {
  trace(
    "src/agent/use_blocks/tool_handlers/tool_handlers",
    "try_check_availability",
    business_id,
    date,
    time,
    party_size,
  )
  try {
    const slot = check_availability(business_id, date, time, party_size)
    if (!slot) {
      return {
        status: "error",
        error: `No availability on ${date} at ${time} for ${party_size} ${party_size === 1 ? "person" : "people"}.`,
      }
    }
    return {
      status: "success",
      data: {
        tool_use_name: "handle_check_availability",
        content: {
          slot_id: slot.id,
          date: slot.date,
          time: slot.time,
          available_capacity: slot.capacity - slot.reserved,
        },
      },
    }
  } catch (err) {
    logger.error("check_availability query failed", { err: String(err) })
    return { status: "error", error: "Failed to check availability. Please try again." }
  }
}

const INVALID_PARTY_SIZE: tool_use_block_result_type = {
  status: "error",
  error: "Party size must be at least 1.",
}

export const handle_check_availability = (
  input: check_availability_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_check_availability", input)
  const { business_id, date, time, party_size = 1 } = input

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { status: "error", error: `Invalid date format "${date}". Use YYYY-MM-DD.` }
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { status: "error", error: `Invalid time format "${time}". Use HH:MM.` }
  }

  if (party_size < 1) {
    return INVALID_PARTY_SIZE
  }

  return try_check_availability(business_id, date, time, party_size)
}

//  --

const try_create_reservation = (
  business_id: string,
  user_id: string,
  slot_id: string,
  party_size: number,
  current_time_ms: number,
  notes: string | undefined,
): tool_use_block_result_type => {
  trace(
    "src/agent/use_blocks/tool_handlers/tool_handlers",
    "try_create_reservation",
    party_size,
    current_time_ms,
    business_id,
    user_id,
    slot_id,
    notes,
  )
  try {
    const reservation = create_reservation(
      party_size,
      current_time_ms,
      business_id,
      user_id,
      slot_id,
      notes,
    )
    const slot = find_slot_by_id(slot_id)
    return {
      status: "success",
      data: {
        tool_use_name: "handle_create_reservation",
        content: {
          reservation_id: reservation.id,
          date: slot?.date ?? "",
          time: slot?.time ?? "",
          party_size: reservation.party_size,
          status: reservation.status,
          notes: reservation.notes ?? null,
        },
      },
    }
  } catch (err) {
    if (err instanceof capacity_error || err instanceof slot_not_found_error) {
      return { status: "error", error: err.message }
    }
    logger.error("create_reservation failed", { err: String(err), user_id, slot_id })
    return { status: "error", error: "Failed to create reservation. Please try again." }
  }
}

export const handle_create_reservation = (
  current_time_ms: number,
  input: create_reservation_input_type,
): tool_use_block_result_type => {
  trace(
    "src/agent/use_blocks/tool_handlers/tool_handlers",
    "handle_create_reservation",
    current_time_ms,
    input,
  )
  const { user_id, business_id, slot_id, party_size = 1, notes } = input

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

  return try_create_reservation(
    business_id,
    user_id,
    slot_id as string,
    party_size,
    current_time_ms,
    notes,
  )
}

//  --

export const handle_list_reservations = (
  input: list_reservations_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_list_reservations", input)
  const { user_id } = input
  try {
    const rows = find_reservations(user_id)
    return {
      status: "success",
      data: {
        tool_use_name: "handle_list_reservations",
        content: {
          reservations: rows.map((r) => ({
            reservation_id: r.id,
            party_size: r.party_size,
            status: r.status,
            notes: r.notes ?? null,
            created_at: r.created_at,
          })),
        },
      },
    }
  } catch (err) {
    logger.error("list_reservations failed", { err: String(err), user_id })
    return { status: "error", error: "Failed to retrieve reservations. Please try again." }
  }
}

//  --

export const handle_find_reservation = (
  input: find_reservation_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_find_reservation", input)
  const { user_id, reservation_id } = input

  try {
    const reservation = find_reservation(user_id, reservation_id)
    if (!reservation) {
      return {
        status: "error",
        error: `Reservation ${reservation_id} not found.`,
      }
    }
    return {
      status: "success",
      data: {
        tool_use_name: "handle_find_reservation",
        content: {
          reservation_id: reservation.id,
          time_slot_id: reservation.time_slot_id,
          party_size: reservation.party_size,
          status: reservation.status,
          notes: reservation.notes ?? null,
          created_at: reservation.created_at,
        },
      },
    }
  } catch (err) {
    logger.error("find_reservation failed", { err: String(err), user_id, reservation_id })
    return { status: "error", error: "Failed to retrieve reservation. Please try again." }
  }
}

//  --

export const handle_cancel_reservation = (
  input: cancel_reservation_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_cancel_reservation", input)
  const { user_id, reservation_id } = input

  try {
    const cancelled = cancel_reservation(user_id, reservation_id as string)
    if (!cancelled) {
      return {
        status: "error",
        error: "Reservation not found or already cancelled. Only the reservation owner can cancel.",
      }
    }
    return {
      status: "success",
      data: {
        tool_use_name: "handle_cancel_reservation",
        content: {
          reservation_id,
          status: "cancelled",
        },
      },
    }
  } catch (err) {
    logger.error("cancel_reservation failed", { err: String(err), user_id, reservation_id })
    return { status: "error", error: "Failed to cancel reservation. Please try again." }
  }
}

//  --

export const handle_reschedule_reservation = (
  input: reschedule_reservation_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_reschedule_reservation", input)
  return { status: "error", error: "reschedule_reservation is not yet implemented." }
}

//  --

export const handle_find_business_id = (
  input: find_business_id_input_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/tool_handlers/tool_handlers", "handle_find_business_id", input)
  const { business_name } = input

  try {
    const businesses = find_businesses_by_name(business_name)
    if (businesses.length === 0) {
      return { status: "error", error: `No business found with name "${business_name}".` }
    }
    if (businesses.length > 1) {
      const names = businesses.map((c) => c.name ?? "unknown").join(", ")
      return {
        status: "error",
        error: `Multiple businesses match "${business_name}": ${names}. Please be more specific.`,
      }
    }
    return {
      status: "success",
      data: {
        tool_use_name: "handle_find_business_id",
        content: {
          resolved_business_id: businesses[0].id,
        },
      },
    }
  } catch (err) {
    logger.error("find_business_id_failed", { err: String(err), business_name })
    return { status: "error", error: "Failed to find business id." }
  }
}
