import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages"

export type { MessageParam }

export type session_entry_type = {
  history: MessageParam[]
  last_active: number
  business_id?: string
}

// Tool input shapes — validated at runtime when dispatching

export type check_availability_input_type = {
  date: string
  time: string
  party_size?: number
}

export type create_booking_input_type = {
  slot_id: string
  party_size?: number
  notes?: string
}

export type list_bookings_input_type = Record<string, never>

export type get_booking_input_type = {
  reservation_id: string
}

export type cancel_booking_input_type = {
  reservation_id: string
}

export type reschedule_booking_input_type = {
  reservation_id: string
  new_date: string
  new_time: string
}

// Tool handler result — either a success payload or an error string
export type tool_result_type =
  | {
      status: "success"
      data: unknown
    }
  | {
      status: "error"
      error: string
    }

export type retrieve_business_id_input_type = {
  business_name: string
}
