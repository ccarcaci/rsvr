import { type Mock, mock } from "bun:test"

// biome-ignore lint/suspicious/noExplicitAny: because it uses generic interface to enable mock
type mock_fn_type = (...args: any[]) => any

type mock_transcribe_type = {
  transcribe_audio: Mock<mock_fn_type>
}
export const mock_transcribe_module: mock_transcribe_type = {
  transcribe_audio: mock(),
}

export { mock_anthropic_module, mock_db_module } from "../agent/mock"
