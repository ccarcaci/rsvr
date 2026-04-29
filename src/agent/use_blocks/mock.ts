import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

//  --

type mock_tool_handlers_type = {
  handle_check_availability: Mock<mock_fn_type>
  handle_create_reservation: Mock<mock_fn_type>
  handle_list_reservations: Mock<mock_fn_type>
  handle_find_reservation: Mock<mock_fn_type>
  handle_cancel_reservation: Mock<mock_fn_type>
  handle_reschedule_reservation: Mock<mock_fn_type>
  handle_find_business_id: Mock<mock_fn_type>
}

export const mock_tool_handlers_module: mock_tool_handlers_type = {
  handle_check_availability: mock(),
  handle_create_reservation: mock(),
  handle_list_reservations: mock(),
  handle_find_reservation: mock(),
  handle_cancel_reservation: mock(),
  handle_reschedule_reservation: mock(),
  handle_find_business_id: mock(),
}

//  --

type mock_session_type = {
  find_session: Mock<mock_fn_type>
  add_message_to_session: Mock<mock_fn_type>
}

export const mock_session_module: mock_session_type = {
  find_session: mock(),
  add_message_to_session: mock(),
}
