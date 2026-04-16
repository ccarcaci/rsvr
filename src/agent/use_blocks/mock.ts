import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

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
