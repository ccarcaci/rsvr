import { describe, expect, test } from "bun:test"
import { parse_telegram_text_ctx, parse_telegram_voice_ctx } from "./schemas"

const valid_from = { id: 123456789, first_name: "Alice" }

describe("telegram_text_ctx_schema", () => {
  test("accepts_valid_text_context", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: { message_id: 1, text: "Hello", from: valid_from },
    }

    //  --  act & assert
    expect(() => parse_telegram_text_ctx(raw)).not.toThrow()
    const result = parse_telegram_text_ctx(raw)
    expect(result.from.id).toBe(123456789)
    expect(result.from.first_name).toBe("Alice")
    expect(result.message.text).toBe("Hello")
  })

  test("accepts_context_with_optional_last_name_and_username", () => {
    //  --  arrange
    const raw = {
      from: { id: 1, first_name: "Bob", last_name: "Smith", username: "bob" },
      message: {
        message_id: 2,
        text: "Hi",
        from: { id: 1, first_name: "Bob", last_name: "Smith", username: "bob" },
      },
    }

    //  --  act
    const result = parse_telegram_text_ctx(raw)

    //  --  assert
    expect(result.from.last_name).toBe("Smith")
    expect(result.from.username).toBe("bob")
  })

  test("rejects_missing_from_field", () => {
    //  --  arrange
    const raw = {
      message: { message_id: 1, text: "Hello", from: valid_from },
    }

    //  --  assert
    expect(() => parse_telegram_text_ctx(raw)).toThrow()
  })

  test("rejects_missing_message_field", () => {
    //  --  arrange
    const raw = { from: valid_from }

    //  --  assert
    expect(() => parse_telegram_text_ctx(raw)).toThrow()
  })

  test("rejects_non_numeric_user_id", () => {
    //  --  arrange
    const raw = {
      from: { id: "not-a-number", first_name: "Alice" },
      message: { message_id: 1, text: "Hello", from: valid_from },
    }

    //  --  assert
    expect(() => parse_telegram_text_ctx(raw)).toThrow()
  })

  test("rejects_missing_text_in_message", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: { message_id: 1, from: valid_from },
    }

    //  --  assert
    expect(() => parse_telegram_text_ctx(raw)).toThrow()
  })

  test("rejects_null_input", () => {
    //  --  assert
    expect(() => parse_telegram_text_ctx(null)).toThrow()
  })
})

describe("telegram_voice_ctx_schema", () => {
  test("accepts_valid_voice_context", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: {
        message_id: 10,
        from: valid_from,
        voice: { file_id: "file_abc123", duration: 5 },
      },
    }

    //  --  act
    const result = parse_telegram_voice_ctx(raw)

    //  --  assert
    expect(result.message.voice.file_id).toBe("file_abc123")
    expect(result.message.voice.duration).toBe(5)
  })

  test("accepts_voice_with_optional_mime_type_and_file_size", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: {
        message_id: 11,
        from: valid_from,
        voice: {
          file_id: "file_xyz",
          duration: 12,
          mime_type: "audio/ogg",
          file_size: 8192,
        },
      },
    }

    //  --  act
    const result = parse_telegram_voice_ctx(raw)

    //  --  assert
    expect(result.message.voice.mime_type).toBe("audio/ogg")
    expect(result.message.voice.file_size).toBe(8192)
  })

  test("rejects_missing_voice_field", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: { message_id: 12, from: valid_from },
    }

    //  --  assert
    expect(() => parse_telegram_voice_ctx(raw)).toThrow()
  })

  test("rejects_voice_with_non_string_file_id", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: {
        message_id: 13,
        from: valid_from,
        voice: { file_id: 42, duration: 3 },
      },
    }

    //  --  assert
    expect(() => parse_telegram_voice_ctx(raw)).toThrow()
  })

  test("rejects_voice_with_missing_duration", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: {
        message_id: 14,
        from: valid_from,
        voice: { file_id: "file_abc" },
      },
    }

    //  --  assert
    expect(() => parse_telegram_voice_ctx(raw)).toThrow()
  })
})

describe("parse_telegram_text_ctx", () => {
  test("returns_validated_ctx_on_valid_input", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: { message_id: 1, text: "hi", from: valid_from },
    }

    //  --  act
    const result = parse_telegram_text_ctx(raw)

    //  --  assert
    expect(result.from.first_name).toBe("Alice")
  })

  test("throws_on_invalid_input", () => {
    //  --  arrange
    const raw = { from: valid_from }

    //  --  assert
    expect(() => parse_telegram_text_ctx(raw)).toThrow()
  })
})

describe("parse_telegram_voice_ctx", () => {
  test("returns_validated_ctx_on_valid_input", () => {
    //  --  arrange
    const raw = {
      from: valid_from,
      message: {
        message_id: 20,
        from: valid_from,
        voice: { file_id: "f1", duration: 7 },
      },
    }

    //  --  act
    const result = parse_telegram_voice_ctx(raw)

    //  --  assert
    expect(result.message.voice.file_id).toBe("f1")
  })

  test("throws_on_invalid_input", () => {
    //  --  arrange
    const raw = "not an object"

    //  --  assert
    expect(() => parse_telegram_voice_ctx(raw)).toThrow()
  })
})
