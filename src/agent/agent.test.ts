import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { mock_ai_client_module, mock_use_block_module } from "./mock"

const CURRENT_TIME_MS = 42

describe("run_agent", () => {
  let agent: typeof import("./agent")

  beforeAll(async () => {
    mock_module("./agent/use_blocks/use_blocks", () => mock_use_block_module)
    mock_module("./agent/ai_client/ai_client", () => mock_ai_client_module)
    agent = await import("./agent")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_assistant_text_on_end_turn", async () => {
    //  --  arrange
    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "end_turn",
      text_block: "How can I help you today?",
    })

    //  --  act
    const result = await agent.run_agent(CURRENT_TIME_MS, "test:end_turn", "Hello")

    //  --  assert
    expect(result).toBe("How can I help you today?")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("returns_fallback_text_when_end_turn_has_no_text_block", async () => {
    //  --  arrange
    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "end_turn",
    })

    //  --  act
    const result = await agent.run_agent(CURRENT_TIME_MS, "test:no_text", "Hello")

    //  --  assert
    expect(result).toBe("Done.")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("calls_use_blocks_and_returns_final_text_after_tool_round_trip", async () => {
    //  --  arrange
    let call_count = 0
    const use_blocks_input = [
      {
        id: "check_availability",
        input: { date: "2099-12-31", time: "19:00", party_size: 2 },
      },
    ]
    mock_use_block_module.use_blocks.mockReturnValue([
      { status: "success", data: { tool_use_name: "check_availability", content: "" } },
    ])
    mock_ai_client_module.prompt.mockImplementation(() => {
      call_count++
      if (call_count === 1) {
        return Promise.resolve({
          stop_reason: "tool_use",
          feedback_content: [],
          use_blocks: use_blocks_input,
        })
      }
      return Promise.resolve({
        stop_reason: "end_turn",
        text_block: "There are available slots on that date.",
      })
    })

    //  --  act
    const result = await agent.run_agent(CURRENT_TIME_MS, "test:tool_dispatch", "Reserve a table")

    //  --  assert
    expect(result).toBe("There are available slots on that date.")
    expect(call_count).toBe(2)
    expect(mock_use_block_module.use_blocks).toBeCalledTimes(1)
    expect(mock_use_block_module.use_blocks).toBeCalledWith(CURRENT_TIME_MS, use_blocks_input)
  })

  test("passes_tool_error_results_back_to_model_and_returns_final_text", async () => {
    //  --  arrange
    let call_count = 0
    mock_use_block_module.use_blocks.mockReturnValue([
      { status: "error", error: "Unknown tool: nonexistent_tool" },
    ])
    mock_ai_client_module.prompt.mockImplementation(() => {
      call_count++
      if (call_count === 1) {
        return Promise.resolve({
          stop_reason: "tool_use",
          feedback_content: [],
          use_blocks: [{ id: "nonexistent_tool", input: {} }],
        })
      }
      return Promise.resolve({
        stop_reason: "end_turn",
        text_block: "I cannot do that.",
      })
    })

    //  --  act
    const result = await agent.run_agent(
      CURRENT_TIME_MS,
      "test:unknown_tool",
      "Do something unsupported",
    )

    //  --  assert
    expect(result).toBe("I cannot do that.")
    expect(call_count).toBe(2)
    expect(mock_use_block_module.use_blocks).toBeCalledTimes(1)
  })

  test("returns_error_message_when_tool_call_limit_is_exceeded", async () => {
    //  --  arrange
    mock_use_block_module.use_blocks.mockReturnValue([
      { status: "error", error: "No availability." },
    ])
    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "tool_use",
      feedback_content: [],
      use_blocks: [{ id: "check_availability", input: { date: "2099-01-01", time: "12:00" } }],
    })

    //  --  act
    const result = await agent.run_agent(CURRENT_TIME_MS, "test:loop_limit", "Loop forever")

    //  --  assert
    expect(result).toBe("Something went wrong, please try again.")
    expect(mock_use_block_module.use_blocks).toHaveBeenCalled()
  })

  test("returns_error_message_on_unexpected_stop_reason", async () => {
    //  --  arrange
    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "max_tokens",
      text_block: "",
    })

    //  --  act
    const result = await agent.run_agent(CURRENT_TIME_MS, "test:unexpected_stop", "Hello")

    //  --  assert
    expect(result).toBe("Something went wrong, please try again.")
  })
})
