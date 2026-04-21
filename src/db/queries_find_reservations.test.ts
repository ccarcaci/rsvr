import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { cancel_reservation, create_reservation, find_reservations } from "./queries"
import { seed_slot, setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
const USER_ID = "D5F7BA6A-19C2-42F3-8080-17F098BB807D" // Alice Johnson
const OTHER_USER_ID = "507259D3-B912-4DBE-9D87-D5F06741B021" // Bob Smith
const CURRENT_TIME_MS = 1710849600000

describe("find_reservations", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterEach(() => {
    test_db.run("DELETE FROM reservations")
    test_db.run("DELETE FROM time_slots")
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_empty_array_when_user_has_no_reservations", () => {
    //  --  act
    const result = find_reservations(USER_ID)

    //  --  assert
    expect(result).toEqual([])
  })

  test("returns_confirmed_reservations_for_user", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, BUSINESS_ID, "2026-05-01", "19:00", 10)
    create_reservation(2, CURRENT_TIME_MS, BUSINESS_ID, USER_ID, slot_id)

    //  --  act
    const result = find_reservations(USER_ID)

    //  --  assert
    expect(result).toEqual([
      {
        id: expect.any(String),
        business_id: BUSINESS_ID,
        user_id: USER_ID,
        time_slot_id: slot_id,
        party_size: 2,
        status: "confirmed",
        notes: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    ])
  })

  test("does_not_return_cancelled_reservations", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, BUSINESS_ID, "2026-05-02", "12:00", 10)
    const reservation = create_reservation(2, CURRENT_TIME_MS, BUSINESS_ID, USER_ID, slot_id)
    cancel_reservation(USER_ID, reservation.id)

    //  --  act
    const result = find_reservations(USER_ID)

    //  --  assert
    expect(result).toEqual([])
  })

  test("does_not_return_reservations_belonging_to_other_users", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, BUSINESS_ID, "2026-05-03", "09:00", 10)
    create_reservation(3, CURRENT_TIME_MS, BUSINESS_ID, OTHER_USER_ID, slot_id)

    //  --  act
    const result = find_reservations(USER_ID)

    //  --  assert
    expect(result).toEqual([])
  })

  test("returns_multiple_confirmed_reservations", () => {
    //  --  arrange
    const slot1 = seed_slot(test_db, BUSINESS_ID, "2026-05-01", "18:00", 10)
    const slot2 = seed_slot(test_db, BUSINESS_ID, "2026-05-01", "20:00", 10)
    create_reservation(2, CURRENT_TIME_MS, BUSINESS_ID, USER_ID, slot1)
    create_reservation(4, CURRENT_TIME_MS, BUSINESS_ID, USER_ID, slot2)

    //  --  act
    const result = find_reservations(USER_ID)

    //  --  assert
    const sorted = [...result].sort((a, b) => a.party_size - b.party_size)
    expect(sorted).toEqual([
      {
        id: expect.any(String),
        business_id: BUSINESS_ID,
        user_id: USER_ID,
        time_slot_id: slot1,
        party_size: 2,
        status: "confirmed",
        notes: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
      {
        id: expect.any(String),
        business_id: BUSINESS_ID,
        user_id: USER_ID,
        time_slot_id: slot2,
        party_size: 4,
        status: "confirmed",
        notes: null,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    ])
  })
})
