import { afterEach, describe, expect, mock, test } from "bun:test"
import { mock_anthropic_module, mock_tool_handlers_module } from "./mock"

mock.module("../parser/client/anthropic", () => mock_anthropic_module)

const agent = await import("./agent")

const make_end_turn = (text: string) => ({
  content: [{ type: "text" as const, text }],
  stop_reason: "end_turn" as const,
  stop_sequence: null,
})

const make_tool_use = (tool_id: string, tool_name: string, input: Record<string, unknown>) => ({
  content: [
    {
      type: "tool_use" as const,
      id: tool_id,
      name: tool_name,
      input,
      caller: { type: "direct" as const },
    },
  ],
  stop_reason: "tool_use" as const,
  stop_sequence: null,
})

describe("run_agent", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  test("returns_assistant_text_on_end_turn", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () =>
      make_end_turn("How can I help you today?"),
    )

    //  --  act
    const result = await agent.run_agent(1, 42, "test:end_turn", "Hello")

    //  --  assert
    expect(result).toBe("How can I help you today?")
  })

  test("dispatches_tool_use_and_returns_final_text_after_tool_round-trip", async () => {
    //  --  arrange
    let call_count = 0

    mock_tool_handlers_module.handle_check_availability.mockReturnValue({
      ok: true,
      data: {
        slot_id: 1,
        date: "2099-12-31",
        time: "19:00",
        available_capacity: 8,
      },
    })

    mock_anthropic_module.messages_create.mockImplementation(async () => {
      call_count++
      if (call_count === 1) {
        // First call: model wants to check availability
        return make_tool_use("tool_1", "check_availability", {
          date: "2099-12-31",
          time: "19:00",
          party_size: 2,
        })
      }
      // Second call after tool result: model gives final answer
      return make_end_turn("Sorry, no tables available for that date.")
    })

    //  --  act
    const result = await agent.run_agent(1, 42, "test:tool_dispatch", "Book a table")

    //  --  assert
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    expect(call_count).toBe(2)
  })

  test("returns_error_message_when_tool_call_limit_is_exceeded", async () => {
    //  --  arrange
    // Always returns tool_use to drive the loop into the limit
    mock_tool_handlers_module.handle_check_availability.mockReturnValue({
      ok: false,
      error: "No availability.",
    })

    mock_anthropic_module.messages_create.mockImplementation(async () =>
      make_tool_use("tool_x", "check_availability", {
        date: "2099-01-01",
        time: "12:00",
      }),
    )

    //  --  act
    const result = await agent.run_agent(1, 42, "test:loop_limit", "Loop forever")

    //  --  assert
    expect(result).toBe("Something went wrong, please try again.")
  })

  test("returns_connection_error_message_when_api_throws", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () => {
      throw new Error("Network error")
    })

    //  --  act
    const result = await agent.run_agent(1, 42, "test:api_error", "Hello")

    //  --  assert
    expect(result).toBe("I'm having trouble connecting. Please try again in a moment.")
  })

  test("handles_unknown_tool_name_by_passing_error_result_back_to_model", async () => {
    //  --  arrange
    let call_count = 0

    mock_anthropic_module.messages_create.mockImplementation(async () => {
      call_count++
      if (call_count === 1) {
        return make_tool_use("tool_2", "nonexistent_tool", {})
      }
      return make_end_turn("I cannot do that.")
    })

    //  --  act
    const result = await agent.run_agent(1, 42, "test:unknown_tool", "Do something unsupported")

    //  --  assert
    expect(typeof result).toBe("string")
    expect(call_count).toBe(2)
  })

  test("returns_fallback_when_end_turn_response_has_no_text_block", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () => ({
      content: [],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
    }))

    //  --  act
    const result = await agent.run_agent(1, 42, "test:no_text", "Hello")

    //  --  assert
    expect(result).toBe("Done.")
  })
})
