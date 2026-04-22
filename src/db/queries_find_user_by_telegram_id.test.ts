import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { find_user_by_telegram_id } from "./queries"
import { setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

describe("find_user_by_telegram_id", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_null_when_telegram_id_not_found", () => {
    //  --  act
    const result = find_user_by_telegram_id("000000000")

    //  --  assert
    expect(result).toBeNull()
  })

  test("finds_user_by_telegram_id", () => {
    //  --  arrange
    // (seed data has Frank Miller with telegram_id '987654321')

    //  --  act
    const result = find_user_by_telegram_id("987654321")

    //  --  assert
    expect(result).toEqual({
      id: "F8E9C3A2-D1B4-4F7E-9A2C-5B6D8E1F3A4B",
      phone: null,
      telegram_id: "987654321",
      name: "Frank Miller",
      channel: "telegram",
      created_at: "2026-04-10 00:00:00",
    })
  })
})
