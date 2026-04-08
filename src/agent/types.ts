import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages"

export type { MessageParam }

export type session_entry_type = {
  history: MessageParam[]
  last_active: number
}

// Tool input shapes — validated at runtime when dispatching

export type check_availability_input_type = {
  date: string
  time: string
  party_size?: number
}

export type create_booking_input_type = {
  slot_id: number
  party_size?: number
  notes?: string
}

export type list_bookings_input_type = Record<string, never>

export type get_booking_input_type = {
  reservation_id: number
}

export type cancel_booking_input_type = {
  reservation_id: number
}

export type reschedule_booking_input_type = {
  reservation_id: number
  new_date: string
  new_time: string
}

// Tool handler result — either a success payload or an error string
export type tool_result_type =
  | {
      ok: true
      data: unknown
    }
  | {
      ok: false
      error: string
    }
