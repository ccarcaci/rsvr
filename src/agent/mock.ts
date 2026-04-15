import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

//  --

type mock_ai_client_type = {
  prompt: Mock<mock_fn_type>
}

export const mock_ai_client_module: mock_ai_client_type = {
  prompt: mock(),
}

//  --

type mock_db_type = {
  find_user_by_phone: Mock<mock_fn_type>
  find_user_by_telegram_id: Mock<mock_fn_type>
  create_user: Mock<mock_fn_type>
  check_availability: Mock<mock_fn_type>
  create_reservation: Mock<mock_fn_type>
  cancel_reservation: Mock<mock_fn_type>
  find_reservations: Mock<mock_fn_type>
  find_slot_by_id: Mock<mock_fn_type>
  find_businesses_by_name: Mock<mock_fn_type>
}
export const mock_db_module: mock_db_type = {
  find_user_by_phone: mock(),
  find_user_by_telegram_id: mock(),
  create_user: mock(),
  check_availability: mock(),
  create_reservation: mock(),
  cancel_reservation: mock(),
  find_reservations: mock(),
  find_slot_by_id: mock(),
  find_businesses_by_name: mock(),
}

//  --

type mock_tool_handlers_type = {
  handle_check_availability: Mock<mock_fn_type>
  handle_create_booking: Mock<mock_fn_type>
  handle_list_bookings: Mock<mock_fn_type>
  handle_get_booking: Mock<mock_fn_type>
  handle_cancel_booking: Mock<mock_fn_type>
  handle_reschedule_booking: Mock<mock_fn_type>
  handle_retrieve_business_id: Mock<mock_fn_type>
}
export const mock_tool_handlers_module: mock_tool_handlers_type = {
  handle_check_availability: mock(),
  handle_create_booking: mock(),
  handle_list_bookings: mock(),
  handle_get_booking: mock(),
  handle_cancel_booking: mock(),
  handle_reschedule_booking: mock(),
  handle_retrieve_business_id: mock(),
}
