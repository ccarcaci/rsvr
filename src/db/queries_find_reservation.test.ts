import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, mock, test } from "bun:test"
import { setup_db } from "./queries_test_helpers"
import { mock_module, mock_restore } from "../mock_module"
import { cancel_reservation, create_reservation, find_reservation } from "./queries"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const SEED_BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
const SEED_RESERVATION_ID = "6AF706F9-12B1-40DF-8C1C-3812331AF58E"
const SEED_USER_ID = "D5F7BA6A-19C2-42F3-8080-17F098BB807D" // Alice Johnson
const CURRENT_TIME_MS = 171084960000081

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
    const non_existing_reservation_id = "6AF706F9-12B1-40DF-8C1C-3812331AF58E"
    const result = find_reservation(SEED_USER_ID, non_existing_reservation_id)

    //  --  assert
    expect(result).toBe(null)
  })

  test("returns_reservation_found", () => {
    //  --  act
    const result = find_reservation(SEED_USER_ID, "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5")

    //  --  assert
    expect(result).toEqual({
      id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
      business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
      user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
      party_size: 2,
      status: "confirmed",
      notes: "Gluten-free breakfast needed",
      created_at: "2026-04-02 00:00:00",
      updated_at: "2026-04-02 00:00:00",
    })
  })

  test("returns_cancelled_reservation", () => {
    //  --  arrange
    const reservation = create_reservation(2, CURRENT_TIME_MS, SEED_BUSINESS_ID, SEED_USER_ID, "A9B0C1D2-E3F4-4C05-6B82-2031425DD7D7")
    cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  act
    const result = find_reservation(SEED_USER_ID, reservation.id)

    //  -  assert
    expect(result).toEqual({
      id: reservation.id,
      business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
      user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      time_slot_id: "A9B0C1D2-E3F4-4C05-6B82-2031425DD7D7",
      party_size: 2,
      status: "cancelled",
      notes: null,
      created_at: reservation.created_at,
      updated_at: expect.any(String),
    })
  })

  test("does_not_return_a_reservation_belonging_to_another_user", () => {
    //  --  act
    const ANOTHER_SEED_USER_ID = "507259D3-B912-4DBE-9D87-D5F06741B021"
    const result = find_reservation(ANOTHER_SEED_USER_ID, SEED_RESERVATION_ID)

    //  --  assert
    expect(result).toBe(null)
  })
})
