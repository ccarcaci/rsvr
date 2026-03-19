import { describe, expect, mock, test } from "bun:test"
import { mock_anthropic_module } from "./client/mock"

mock.module("./client/anthropic", () => ({
  get_anthropic_client: () => ({
    messages: {
      create: mock_anthropic_module.messages_create,
    },
  }),
  init_anthropic_client: () => {},
}))

const intent_module = await import("./intent")

describe("parse_intent", () => {
  test("should_parse_a_restaurant_reservation_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [
        {
          type: "text" as const,
          text: '{"action":"reserve","domain":"restaurant","date":"2026-03-01","time":"19:00","party_size":4}',
        },
      ],
    })

    //  --  act
    const intent = await intent_module.parse_intent("Book a table for 4 on March 1st at 7pm")

    //  --  assert
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("restaurant")
      expect(intent.date).toBe("2026-03-01")
      expect(intent.time).toBe("19:00")
      expect(intent.party_size).toBe(4)
    }
  })

  test("should_parse_a_cancellation_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [{ type: "text" as const, text: '{"action":"cancel","reservation_id":42}' }],
    })

    //  --  act
    const intent = await intent_module.parse_intent("Cancel reservation 42")

    //  --  assert
    expect(intent.action).toBe("cancel")
    if (intent.action === "cancel") {
      expect(intent.reservation_id).toBe(42)
    }
  })

  test("should_parse_a_list_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [{ type: "text" as const, text: '{"action":"list"}' }],
    })

    //  --  act
    const intent = await intent_module.parse_intent("Show my reservations")

    //  --  assert
    expect(intent.action).toBe("list")
  })

  test("should_parse_a_help_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [{ type: "text" as const, text: '{"action":"help"}' }],
    })

    //  --  act
    const intent = await intent_module.parse_intent("Hello, what can you do?")

    //  --  assert
    expect(intent.action).toBe("help")
  })

  test("should_return_unknown_for_unparseable_responses", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [{ type: "text" as const, text: "I'm not sure what you mean" }],
    })

    //  --  act
    const intent = await intent_module.parse_intent("asdfghjkl")

    //  --  assert
    expect(intent.action).toBe("unknown")
  })

  test("should_parse_a_doctor_appointment_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [
        {
          type: "text" as const,
          text: '{"action":"reserve","domain":"doctor","date":"2026-03-05","time":"10:00","notes":"annual checkup"}',
        },
      ],
    })

    //  --  act
    const intent = await intent_module.parse_intent(
      "I need a doctor appointment on March 5th at 10am for my annual checkup",
    )

    //  --  assert
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("doctor")
      expect(intent.notes).toBe("annual checkup")
    }
  })

  test("should_parse_a_salon_booking_intent", async () => {
    //  --  arrange
    mock_anthropic_module.messages_create.mockResolvedValue({
      content: [
        {
          type: "text" as const,
          text: '{"action":"reserve","domain":"salon","date":"2026-02-28","time":"14:00"}',
        },
      ],
    })

    //  --  act
    const intent = await intent_module.parse_intent("Book me a haircut on Feb 28 at 2pm")

    //  --  assert
    expect(intent.action).toBe("reserve")
    if (intent.action === "reserve") {
      expect(intent.domain).toBe("salon")
    }
  })
})
