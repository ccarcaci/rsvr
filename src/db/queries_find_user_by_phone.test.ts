import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { find_user_by_phone } from "./queries"
import { setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

describe("find_user_by_phone", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_null_when_phone_not_found", () => {
    //  --  act
    const result = find_user_by_phone("+1 (555) 999-9999")

    //  --  assert
    expect(result).toBeNull()
  })

  test("finds_user_by_exact_phone", () => {
    //  --  arrange
    // (seed data has Alice Johnson with +1 (555) 123-4567)

    //  --  act
    const result = find_user_by_phone("+1 (555) 123-4567")

    //  --  assert
    expect(result).toEqual({
      id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      phone: "+1 (555) 123-4567",
      telegram_id: null,
      name: "Alice Johnson",
      channel: "whatsapp",
      created_at: "2026-03-23 00:00:00",
    })
  })

  test("does_not_return_user_on_partial_phone_match", () => {
    //  --  act
    const result = find_user_by_phone("123-4567")

    //  --  assert
    expect(result).toBeNull()
  })
})
