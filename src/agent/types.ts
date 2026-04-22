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
    | "create_reservation"
    | "list_reservations"
    | "find_reservation"
    | "cancel_reservation"
    | "reschedule_reservation"
    | "find_business_id"
  input:
    | check_availability_input_type
    | create_reservation_input_type
    | list_reservations_input_type
    | find_reservation_input_type
    | cancel_reservation_input_type
    | reschedule_reservation_input_type
    | find_business_id_input_type
}

// Tool handler content types

export type check_availability_content_type = {
  slot_id: string
  date: string
  time: string
  available_capacity: number
}

export type create_reservation_content_type = {
  reservation_id: string
  date: string
  time: string
  party_size: number
  status: string
  notes: string | null
}

export type reservation_summary_type = {
  reservation_id: string
  party_size: number
  status: string
  notes: string | null
  created_at: string
}

export type list_reservations_content_type = {
  reservations: reservation_summary_type[]
}

export type cancel_reservation_content_type = {
  reservation_id: string
  status: "cancelled"
}

export type find_reservation_content_type = {
  reservation_id: string
  time_slot_id: string
  party_size: number
  status: string
  notes: string | null
  created_at: string
}

export type find_business_id_content_type = {
  resolved_business_id: string
}

export type tool_handler_content_type =
  | find_business_id_content_type
  | check_availability_content_type
  | create_reservation_content_type
  | list_reservations_content_type
  | cancel_reservation_content_type
  | find_reservation_content_type

//  --

export type tool_use_block_result_success_type = {
  status: "success"
  data: {
    tool_use_id: string
    content: tool_handler_content_type
  }
}

export type tool_use_block_result_error_type = {
  status: "error"
  error: string
}

export type tool_use_block_result_type =
  | tool_use_block_result_success_type
  | tool_use_block_result_error_type
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

export type create_reservation_input_type = {
  slot_id: string
  party_size?: number
  notes?: string
}

export type list_reservations_input_type = Record<string, never>

export type find_reservation_input_type = {
  reservation_id: string
}

export type cancel_reservation_input_type = {
  reservation_id: string
}

export type reschedule_reservation_input_type = {
  reservation_id: string
  new_date: string
  new_time: string
}

export type find_business_id_input_type = {
  business_name: string
}
