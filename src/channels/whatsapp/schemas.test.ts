import { describe, expect, test } from "bun:test"
import {
  parse_whatsapp_webhook_body,
  whatsapp_message_schema,
  whatsapp_webhook_body_schema,
} from "./schemas"

describe("whatsapp_message_schema", () => {
  test("accepts_valid_text_message", () => {
    //  --  arrange
    const raw = { from: "15550001111", type: "text", text: { body: "Hello" } }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    const validated = result as typeof result & { from: string }
    if (!("summary" in validated)) {
      expect(validated.from).toBe("15550001111")
      expect(validated.type).toBe("text")
      expect(validated.text?.body).toBe("Hello")
    } else {
      throw new Error(`validation failed`)
    }
  })

  test("accepts_valid_audio_message", () => {
    //  --  arrange
    const raw = {
      from: "15550001111",
      type: "audio",
      audio: { id: "media_123", mime_type: "audio/ogg" },
    }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    const validated = result as typeof result & { from: string }
    if (!("summary" in validated)) {
      expect(validated.audio?.id).toBe("media_123")
      expect(validated.audio?.mime_type).toBe("audio/ogg")
    } else {
      throw new Error(`validation failed`)
    }
  })

  test("accepts_message_with_no_optional_fields", () => {
    //  --  arrange
    const raw = { from: "15550001111", type: "unknown" }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    expect("summary" in result).toBeFalse()
  })

  test("rejects_missing_from_field", () => {
    //  --  arrange
    const raw = { type: "text", text: { body: "Hello" } }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })

  test("rejects_non_string_from_field", () => {
    //  --  arrange
    const raw = { from: 15550001111, type: "text" }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })

  test("rejects_audio_with_missing_mime_type", () => {
    //  --  arrange
    const raw = { from: "15550001111", type: "audio", audio: { id: "media_123" } }

    //  --  act
    const result = whatsapp_message_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })
})

describe("whatsapp_webhook_body_schema", () => {
  test("accepts_body_with_no_entry_field", () => {
    //  --  arrange
    const raw = {}

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    expect("summary" in result).toBeFalse()
  })

  test("accepts_full_valid_webhook_body", () => {
    //  --  arrange
    const raw = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "15550001111", type: "text", text: { body: "Hi" } }],
                contacts: [{ profile: { name: "Alice" } }],
              },
            },
          ],
        },
      ],
    }

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    if (!("summary" in result)) {
      const validated = result as typeof result & { entry?: unknown[] }
      expect(validated.entry?.[0]?.changes[0]?.value.messages?.[0]?.from).toBe("15550001111")
      expect(validated.entry?.[0]?.changes[0]?.value.contacts?.[0]?.profile.name).toBe("Alice")
    } else {
      throw new Error(`validation failed`)
    }
  })

  test("accepts_entry_with_no_messages_or_contacts", () => {
    //  --  arrange
    const raw = {
      entry: [{ changes: [{ value: {} }] }],
    }

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    expect("summary" in result).toBeFalse()
  })

  test("rejects_entry_that_is_not_an_array", () => {
    //  --  arrange
    const raw = { entry: "not-an-array" }

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })

  test("rejects_entry_with_missing_changes_field", () => {
    //  --  arrange
    const raw = { entry: [{ id: "123" }] }

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })

  test("rejects_message_inside_entry_with_numeric_from", () => {
    //  --  arrange
    const raw = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: 15550001111, type: "text" }],
              },
            },
          ],
        },
      ],
    }

    //  --  act
    const result = whatsapp_webhook_body_schema(raw)

    //  --  assert
    expect("summary" in result).toBeTrue()
  })
})

describe("parse_whatsapp_webhook_body", () => {
  test("returns_parsed_body_on_valid_input", () => {
    //  --  arrange
    const raw = {
      entry: [
        {
          changes: [{ value: { messages: [{ from: "111", type: "text", text: { body: "yo" } }] } }],
        },
      ],
    }

    //  --  act
    const result = parse_whatsapp_webhook_body(raw)

    //  --  assert
    expect(result.entry?.[0]?.changes[0]?.value.messages?.[0]?.from).toBe("111")
  })

  test("throws_on_invalid_input", () => {
    //  --  arrange
    const raw = { entry: "bad" }

    //  --  assert
    expect(() => parse_whatsapp_webhook_body(raw)).toThrow()
  })

  test("throws_on_non_object_input", () => {
    //  --  arrange
    const raw = "just a string"

    //  --  assert
    expect(() => parse_whatsapp_webhook_body(raw)).toThrow()
  })
})
