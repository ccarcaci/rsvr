import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { check_availability } from "./queries"
import { seed_slot, setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const SEED_BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
const SEED_OTHER_BUSINESS_ID = "A023BCC5-B2A4-41C5-AB32-CF145D536D61" // Wellness Medical Center

describe("check_availability", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterEach(() => {
    test_db.run("DELETE FROM time_slots")
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_null_when_no_matching_slot_exists", () => {
    //  --  act
    const result = check_availability(SEED_BUSINESS_ID, "2026-05-01", "19:00", 2)

    //  --  assert
    expect(result).toBeNull()
  })

  test("returns_slot_when_sufficient_capacity_is_available", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "19:00", 10)

    //  --  act
    const result = check_availability(SEED_BUSINESS_ID, "2026-05-01", "19:00", 4)

    //  --  assert
    expect(result).toEqual({
      id: slot_id,
      business_id: SEED_BUSINESS_ID,
      date: "2026-05-01",
      time: "19:00",
      capacity: 10,
      reserved: 0,
      metadata: null,
    })
  })

  test("returns_slot_when_party_size_exactly_matches_remaining_capacity", () => {
    //  --  arrange (capacity=6, reserved=4, remaining=2)
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-02", "20:00", 6, 4)

    //  --  act
    const result = check_availability(SEED_BUSINESS_ID, "2026-05-02", "20:00", 2)

    //  --  assert
    expect(result).toEqual({
      id: slot_id,
      business_id: SEED_BUSINESS_ID,
      date: "2026-05-02",
      time: "20:00",
      capacity: 6,
      reserved: 4,
      metadata: null,
    })
  })

  test("returns_null_when_remaining_capacity_is_less_than_party_size", () => {
    //  --  arrange (capacity=4, reserved=3, remaining=1)
    seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-03", "12:00", 4, 3)

    //  --  act (party_size=2 exceeds remaining=1)
    const result = check_availability(SEED_BUSINESS_ID, "2026-05-03", "12:00", 2)

    //  --  assert
    expect(result).toBeNull()
  })

  test("returns_null_when_slot_is_fully_reserved", () => {
    //  --  arrange (capacity=5, reserved=5)
    seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-04", "09:00", 5, 5)

    //  --  act
    const result = check_availability(SEED_BUSINESS_ID, "2026-05-04", "09:00", 1)

    //  --  assert
    expect(result).toBeNull()
  })

  test("returns_null_when_business_id_does_not_match", () => {
    //  --  arrange
    seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-05", "18:00", 10)

    //  --  act (query with a different business)
    const result = check_availability(SEED_OTHER_BUSINESS_ID, "2026-05-05", "18:00", 1)

    //  --  assert
    expect(result).toBeNull()
  })
})
