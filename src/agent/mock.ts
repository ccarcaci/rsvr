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

type mock_use_blocks_type = {
  use_blocks: Mock<mock_fn_type>
}

export const mock_use_block_module: mock_use_blocks_type = {
  use_blocks: mock(),
}
