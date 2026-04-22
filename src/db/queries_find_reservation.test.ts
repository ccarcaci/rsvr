import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { setup_db } from "./queries_test_helpers"
import { mock_module, mock_restore } from "../mock_module"
import { find_reservation } from "./queries"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
const USER_ID = "D5F7BA6A-19C2-42F3-8080-17F098BB807D" // Alice Johnson
const RESERVATION_ID = "C1C08D53-8138-4BFF-B8EF-66CA08CA5E5D"
const OTHER_USER_ID = "507259D3-B912-4DBE-9D87-D5F06741B021" // Bob Smith
const CURRENT_TIME_MS = 1710849600000

describe("find_single_reservation", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_null_when_reservation_is_not_found", () => {
    //  --  act
    const result = find_reservation(USER_ID, RESERVATION_ID)

    //  --  assert
    expect(result).toBe(null)
  })

  test("returns_reservation_found", () => {
    //  --  act
    const result = find_reservation(USER_ID, "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5")

    //  --  assert
    expect(result).toEqual({
      id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
      business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
      user_id: USER_ID,
      time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
      party_size: 2,
      status: "confirmed",
      notes: "Gluten-free breakfast needed",
      created_at: "2026-04-02 00:00:00",
      updated_at: "2026-04-02 00:00:00",
    })
  })

  test.skip("returns_cancelled_reservation", () => {})

  test.skip("does_not_return_a_reservation_belonging_to_another_user", () => {})
})
