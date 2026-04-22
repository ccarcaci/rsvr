import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { find_slot_by_id } from "./queries"
import { seed_slot, setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const SEED_BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C"

describe("find_slot_by_id", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_null_when_slot_not_found", () => {
    //  --  act
    const result = find_slot_by_id("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")

    //  --  assert
    expect(result).toBeNull()
  })

  test("returns_slot_by_id", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "10:00", 8, 3)

    //  --  act
    const result = find_slot_by_id(slot_id)

    //  --  assert
    expect(result).toEqual({
      id: slot_id,
      business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
      date: "2026-05-01",
      time: "10:00",
      capacity: 8,
      reserved: 3,
      metadata: null,
    })
  })
})
