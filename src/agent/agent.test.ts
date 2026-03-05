import { describe, expect, test, mock } from "bun:test"
import { mock_anthropic_module } from "./mock"

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

mock.module("../parser/client/anthropic", () => ({
    client: {
      messages: {
        create: mock_anthropic_module.messages_create,
      },
    },
  }))

  const agent = await import("./agent")

describe("run_agent", () => {
  test("returns assistant text on end_turn", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () => make_end_turn("How can I help you today?"))

    //  --  act
    const result = await agent.run_agent(1, "test:end_turn", "Hello")

    //  --  assert
    expect(result).toBe("How can I help you today?")
  })

  test("dispatches tool_use and returns final text after tool round-trip", async () => {
    //  --  arrange
    let call_count = 0

    mock_anthropic_module.messages_create.mockImplementation(async () => {
      call_count++
      if (call_count === 1) {
        // First call: model wants to check availability
        return make_tool_use("tool_1", "check_availability", {
          domain: "restaurant",
          date: "2099-12-31",
          time: "19:00",
          party_size: 2,
        })
      }
      // Second call after tool result: model gives final answer
      return make_end_turn("Sorry, no tables available for that date.")
    })

    //  --  act
    const result = await agent.run_agent(1, "test:tool_dispatch", "Book a table")

    //  --  assert
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    expect(call_count).toBe(2)
  })

  test("returns error message when tool call limit is exceeded", async () => {
    //  --  arrange
    // Always returns tool_use to drive the loop into the limit
    mock_anthropic_module.messages_create.mockImplementation(async () =>
      make_tool_use("tool_x", "check_availability", {
        domain: "restaurant",
        date: "2099-01-01",
        time: "12:00",
      }),
    )

    //  --  act
    const result = await agent.run_agent(1, "test:loop_limit", "Loop forever")

    //  --  assert
    expect(result).toBe("Something went wrong, please try again.")
  })

  test("returns connection error message when API throws", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () => {
      throw new Error("Network error")
    })

    //  --  act
    const result = await agent.run_agent(1, "test:api_error", "Hello")

    //  --  assert
    expect(result).toBe("I'm having trouble connecting. Please try again in a moment.")
  })

  test("handles unknown tool name by passing error result back to model", async () => {
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
    const result = await agent.run_agent(1, "test:unknown_tool", "Do something unsupported")

    //  --  assert
    expect(typeof result).toBe("string")
    expect(call_count).toBe(2)
  })

  test("returns fallback when end_turn response has no text block", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockImplementation(async () => ({
      content: [],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
    }))

    //  --  act
    const result = await agent.run_agent(1, "test:no_text", "Hello")

    //  --  assert
    expect(result).toBe("Done.")
  })
})
