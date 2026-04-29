import type { anthropic_api_message_type } from "./ai_client/anthropic/types"

export type ai_client_prompt_result_type = {
  stop_reason: string
  text_block: string
  use_blocks: tool_use_block_request_type[]
}

//  -- tool handler content types

export type tool_handlers_check_availability_result_type = {
  slot_id: string
  date: string
  time: string
  available_capacity: number
}

export type tool_handlers_create_reservation_result_type = {
  reservation_id: string
  date: string
  time: string
  party_size: number
  status: string
  notes: string | null
}

export type tool_handlers_reservation_summary_result_type = {
  reservation_id: string
  party_size: number
  status: string
  notes: string | null
  created_at: string
}

export type tool_handlers_list_reservations_result_type = {
  reservations: tool_handlers_reservation_summary_result_type[]
}

export type tool_handlers_cancel_reservation_result_type = {
  reservation_id: string
  status: "cancelled"
}

export type tool_handlers_find_reservation_result_type = {
  reservation_id: string
  time_slot_id: string
  party_size: number
  status: string
  notes: string | null
  created_at: string
}

export type tool_handlers_find_business_id_result_type = {
  resolved_business_id: string
}

export type tool_handlers_result_type =
  | tool_handlers_find_business_id_result_type
  | tool_handlers_check_availability_result_type
  | tool_handlers_create_reservation_result_type
  | tool_handlers_list_reservations_result_type
  | tool_handlers_cancel_reservation_result_type
  | tool_handlers_find_reservation_result_type

export type tool_use_block_result_success_type = {
  id: string
  status: "success"
  data: {
    tool_use_name: string
    content: tool_handlers_result_type
  }
}

export type tool_use_block_result_error_type = {
  id: string
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
  history: anthropic_api_message_type[]
  last_active: number
}

//  --

export type check_availability_input_type = {
  business_id: string
  date: string
  time: string
  party_size?: number
}

export type create_reservation_input_type = {
  business_id: string
  user_id: string
  slot_id: string
  party_size?: number
  notes?: string
}

export type list_reservations_input_type = {
  user_id: string
}

export type find_reservation_input_type = {
  user_id: string
  reservation_id: string
}

export type cancel_reservation_input_type = {
  user_id: string
  reservation_id: string
}

export type reschedule_reservation_input_type = {
  user_id: string
  reservation_id: string
  new_date: string
  new_time: string
}

export type find_business_id_input_type = {
  business_name: string
}

export type tool_use_block_request_type = {
  id: string
  name:
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
