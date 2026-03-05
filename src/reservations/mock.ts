import { Mock, mock } from "bun:test"

type mock_fn_type = (...args: any[]) => any

type mock_transcribe_type = {
  transcribe_audio: Mock<mock_fn_type>
}
export const mock_transcribe_module: mock_transcribe_type = {
  transcribe_audio: mock(),
}

export { mock_db_module } from "../agent/mock"

type mock_agent_type = {
  run_agent: Mock<mock_fn_type>
}
export const mock_agent_module: mock_agent_type = {
  run_agent: mock(),
}
