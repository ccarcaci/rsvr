import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

type mock_anthropic_type = {
  message_conversation: Mock<mock_fn_type>
}
export const mock_anthropic_module: mock_anthropic_type = {
  message_conversation: mock(),
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
