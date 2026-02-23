import { describe, expect, it } from "bun:test"
import { init_intent_parser, parse_intent } from "./intent"

const create_mock_client = (response_text: string) =>
  ({
    messages: {
      create: async () => ({
        content: [{ type: "text" as const, text: response_text }],
      }),
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock client for testing
  }) as any

describe("parse_intent", () => {
  it("should parse a restaurant reservation intent", async () => {
    init_intent_parser(
      create_mock_client(
        '{"action":"reserve","domain":"restaurant","date":"2026-03-01","time":"19:00","party_size":4}',
      ),
    )

    const intent = await parse_intent("Book a table for 4 on March 1st at 7pm")
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("restaurant")
      expect(intent.date).toBe("2026-03-01")
      expect(intent.time).toBe("19:00")
      expect(intent.party_size).toBe(4)
    }
  })

  it("should parse a cancellation intent", async () => {
    init_intent_parser(create_mock_client('{"action":"cancel","reservation_id":42}'))

    const intent = await parse_intent("Cancel reservation 42")
    expect(intent.action).toBe("cancel")
    if (intent.action === "cancel") {
      expect(intent.reservation_id).toBe(42)
    }
  })

  it("should parse a list intent", async () => {
    init_intent_parser(create_mock_client('{"action":"list"}'))

    const intent = await parse_intent("Show my reservations")
    expect(intent.action).toBe("list")
  })

  it("should parse a help intent", async () => {
    init_intent_parser(create_mock_client('{"action":"help"}'))

    const intent = await parse_intent("Hello, what can you do?")
    expect(intent.action).toBe("help")
  })

  it("should return unknown for unparseable responses", async () => {
    init_intent_parser(create_mock_client("I'm not sure what you mean"))

    const intent = await parse_intent("asdfghjkl")
    expect(intent.action).toBe("unknown")
  })

  it("should parse a doctor appointment intent", async () => {
    init_intent_parser(
      create_mock_client(
        '{"action":"reserve","domain":"doctor","date":"2026-03-05","time":"10:00","notes":"annual checkup"}',
      ),
    )

    const intent = await parse_intent(
      "I need a doctor appointment on March 5th at 10am for my annual checkup",
    )
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("doctor")
      expect(intent.notes).toBe("annual checkup")
    }
  })

  it("should parse a salon booking intent", async () => {
    init_intent_parser(
      create_mock_client(
        '{"action":"reserve","domain":"salon","date":"2026-02-28","time":"14:00"}',
      ),
    )

    const intent = await parse_intent("Book me a haircut on Feb 28 at 2pm")
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("salon")
    }
  })
})
