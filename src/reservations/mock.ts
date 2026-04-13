import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

type mock_transcribe_type = {
  transcribe_audio: Mock<mock_fn_type>
}
export const mock_transcribe_module: mock_transcribe_type = {
  transcribe_audio: mock(),
}

//  --

type mock_anthropic_type = {
  messages_create: Mock<mock_fn_type>
}
export const mock_anthropic_module: mock_anthropic_type = {
  messages_create: mock(),
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
