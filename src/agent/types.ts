import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages"

export type { MessageParam }

export type ai_client_prompt_result_type = {
  stop_reason: string
  text_block: string
  use_blocks: tool_use_block_request_type[]
  feedback_content: unknown
}

//  --

export type tool_use_block_request_type = {
  id:
    | "check_availability"
    | "create_booking"
    | "list_bookings"
    | "get_booking"
    | "cancel_booking"
    | "reschedule_booking"
    | "retrieve_business_id"
  input:
    | check_availability_input_type
    | create_booking_input_type
    | list_bookings_input_type
    | get_booking_input_type
    | cancel_booking_input_type
    | reschedule_booking_input_type
    | retrieve_business_id_input_type
}

export type tool_use_block_result_type =
  | {
      status: "success"
      data: {
        tool_use_id: string
        resolved_business_id?: string
        content: unknown
      }
    }
  | {
      status: "error"
      error: string
    }

//  --

export type session_history_entry_type = {
  role: string
  content: unknown
}

export type session_entry_type = {
  history: session_history_entry_type[]
  last_active: number
  business_id?: string
}

//  --

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

export type retrieve_business_id_input_type = {
  business_name: string
}
