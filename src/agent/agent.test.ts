import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { mock_ai_client_module, mock_tool_handlers_module } from "./mock"

mock_module("./agent/tool_handlers", () => mock_tool_handlers_module)
mock_module("./agent/ai_client/ai_client", () => mock_ai_client_module)

import { run_agent } from "./agent"

describe("run_agent", () => {
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
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:end_turn",
      "Hello",
    )

    //  --  assert
    expect(result).toBe("How can I help you today?")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("dispatches_tool_use_and_returns_final_text_after_tool_round-trip", async () => {
    //  --  arrange
    let call_count = 0

    mock_tool_handlers_module.handle_check_availability.mockReturnValue({
      status: "success",
      data: {
        slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        date: "2099-12-31",
        time: "19:00",
        available_capacity: 8,
      },
    })

    mock_ai_client_module.prompt.mockImplementation(() => {
      call_count++
      if (call_count === 1) {
        // First call: model wants to check availability
        return Promise.resolve({
          stop_reason: "tool_use",
          use_blocks: [
            {
              id: "tool_1",
              name: "check_availability",
              input: {
                date: "2099-12-31",
                time: "19:00",
                party_size: 2,
              },
            },
          ],
        })
      }
      // Second call after tool result: model gives final answer
      return Promise.resolve({
        stop_reason: "end_turn",
        text_block: "Sorry, no tables available for that date.",
      })
    })

    //  --  act
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:tool_dispatch",
      "Book a table",
    )

    //  --  assert
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    expect(call_count).toBe(2)
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(
      expect.any(String),
      expect.objectContaining({
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      }),
    )
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("returns_error_message_when_tool_call_limit_is_exceeded", async () => {
    //  --  arrange
    // Always returns tool_use to drive the loop into the limit
    mock_tool_handlers_module.handle_check_availability.mockReturnValue({
      status: "error",
      error: "No availability.",
    })

    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "tool_use",
      use_blocks: [
        {
          id: "tool_x",
          name: "check_availability",
          input: {
            date: "2099-01-01",
            time: "12:00",
          },
        },
      ],
    })

    //  --  act
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:loop_limit",
      "Loop forever",
    )

    //  --  assert
    expect(result).toBe("Something went wrong, please try again.")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
    expect(mock_tool_handlers_module.handle_check_availability).toHaveBeenCalled()
  })

  test("returns_connection_error_message_when_api_throws", async () => {
    //  --  arrange
    mock_ai_client_module.prompt.mockRejectedValue(new Error("Network error"))

    //  --  act
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:api_error",
      "Hello",
    )

    //  --  assert
    expect(result).toBe("I'm having trouble connecting. Please try again in a moment.")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("handles_unknown_tool_name_by_passing_error_result_back_to_model", async () => {
    //  --  arrange
    let call_count = 0

    mock_ai_client_module.prompt.mockImplementation(() => {
      call_count++
      if (call_count === 1) {
        return Promise.resolve({
          stop_reason: "tool_use",
          name: "nonexistent_tool",
          input: {},
        })
      }
      return Promise.resolve({
        stop_reason: "end_turn",
        text_block: "I cannot do that.",
      })
    })

    //  --  act
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:unknown_tool",
      "Do something unsupported",
    )

    //  --  assert
    expect(typeof result).toBe("string")
    expect(call_count).toBe(2)
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })

  test("returns_fallback_when_end_turn_response_has_no_text_block", async () => {
    //  --  arrange
    mock_ai_client_module.prompt.mockResolvedValue({
      stop_reason: "end_turn",
    })

    //  --  act
    const result = await run_agent(
      "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      42,
      "test:no_text",
      "Hello",
    )

    //  --  assert
    expect(result).toBe("Done.")
    expect(mock_ai_client_module.prompt).toHaveBeenCalled()
  })
})
