import { beforeEach, describe, expect, it, mock } from "bun:test"

// Mutable mock implementation — reassigned per test
let messages_create: (...args: unknown[]) => unknown = async () => ({
  content: [],
  stop_reason: "end_turn",
  stop_sequence: null,
})

// Register mock before importing the module under test.
// The closure references the mutable variable, so reassigning it per test works.
mock.module("../parser/client/anthropic", () => ({
  client: {
    messages: {
      create: async (...args: unknown[]) => messages_create(...args),
    },
  },
}))

const { run_agent } = await import("./agent")

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
  beforeEach(() => {
    messages_create = async () => make_end_turn("Default response")
  })

  it("returns assistant text on end_turn", async () => {
    messages_create = async () => make_end_turn("How can I help you today?")

    const result = await run_agent(1, "test:end_turn", "Hello")
    expect(result).toBe("How can I help you today?")
  })

  it("dispatches tool_use and returns final text after tool round-trip", async () => {
    let call_count = 0

    messages_create = async () => {
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
    }

    const result = await run_agent(1, "test:tool_dispatch", "Book a table")
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
    expect(call_count).toBe(2)
  })

  it("returns error message when tool call limit is exceeded", async () => {
    // Always returns tool_use to drive the loop into the limit
    messages_create = async () =>
      make_tool_use("tool_x", "check_availability", {
        domain: "restaurant",
        date: "2099-01-01",
        time: "12:00",
      })

    const result = await run_agent(1, "test:loop_limit", "Loop forever")
    expect(result).toBe("Something went wrong, please try again.")
  })

  it("returns connection error message when API throws", async () => {
    messages_create = async () => {
      throw new Error("Network error")
    }

    const result = await run_agent(1, "test:api_error", "Hello")
    expect(result).toBe("I'm having trouble connecting. Please try again in a moment.")
  })

  it("handles unknown tool name by passing error result back to model", async () => {
    let call_count = 0

    messages_create = async () => {
      call_count++
      if (call_count === 1) {
        return make_tool_use("tool_2", "nonexistent_tool", {})
      }
      return make_end_turn("I cannot do that.")
    }

    const result = await run_agent(1, "test:unknown_tool", "Do something unsupported")
    expect(typeof result).toBe("string")
    expect(call_count).toBe(2)
  })

  it("returns fallback when end_turn response has no text block", async () => {
    messages_create = async () => ({
      content: [],
      stop_reason: "end_turn" as const,
      stop_sequence: null,
    })

    const result = await run_agent(1, "test:no_text", "Hello")
    expect(result).toBe("Done.")
  })
})
