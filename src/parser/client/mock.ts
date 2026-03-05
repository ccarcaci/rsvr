import { Mock, mock } from "bun:test"

type mock_fn_type = (...args: any[]) => any

type mock_anthropic_type = {
  messages_create: Mock<mock_fn_type>
}
export const mock_anthropic_module: mock_anthropic_type = {
  messages_create: mock(),
}
