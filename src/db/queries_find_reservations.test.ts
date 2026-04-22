import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { cancel_reservation, create_reservation, find_reservations } from "./queries"
import { seed_slot, setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const SEED_BUSINESS_ID = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
const SEED_USER_ID = "D5F7BA6A-19C2-42F3-8080-17F098BB807D" // Alice Johnson
const SEED_OTHER_SEED_USER_ID = "507259D3-B912-4DBE-9D87-D5F06741B021" // Bob Smith
const CURRENT_TIME_MS = 1710849600000

describe("find_reservations", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_empty_array_when_user_has_no_reservations", () => {
    //  --  act
    const SEED_USER_ID_WITH_NO_RESERVATIONS = "43A0E424-88DE-4232-9871-45C2FA55455B"
    const result = find_reservations(SEED_USER_ID_WITH_NO_RESERVATIONS)

    //  --  assert
    expect(result).toEqual([])
  })

  test("returns_confirmed_reservations_for_user", () => {
    //  --  act
    const result = find_reservations(SEED_USER_ID)

    //  --  assert
    expect(result).toEqual([
      {
        id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
        party_size: 2,
        status: "confirmed",
        notes: "Gluten-free breakfast needed",
        created_at: "2026-04-02 00:00:00",
        updated_at: "2026-04-02 00:00:00",
      },
    ])
  })

  test("does_not_return_cancelled_reservations", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-02", "12:00", 10)
    const reservation = create_reservation(
      2,
      CURRENT_TIME_MS,
      SEED_BUSINESS_ID,
      SEED_USER_ID,
      slot_id,
    )
    cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  act
    const result = find_reservations(SEED_USER_ID)

    //  --  assert
    expect(result).toEqual([
      {
        id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
        party_size: 2,
        status: "confirmed",
        notes: "Gluten-free breakfast needed",
        created_at: "2026-04-02 00:00:00",
        updated_at: "2026-04-02 00:00:00",
      },
    ])
  })

  test("does_not_return_reservations_belonging_to_other_users", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-03", "09:00", 10)
    create_reservation(3, CURRENT_TIME_MS, SEED_BUSINESS_ID, SEED_OTHER_SEED_USER_ID, slot_id)

    //  --  act
    const result = find_reservations(SEED_USER_ID)

    //  --  assert
    expect(result).toEqual([
      {
        id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
        party_size: 2,
        status: "confirmed",
        notes: "Gluten-free breakfast needed",
        created_at: "2026-04-02 00:00:00",
        updated_at: "2026-04-02 00:00:00",
      },
    ])
  })

  test("returns_multiple_confirmed_reservations", () => {
    //  --  arrange
    const slot1 = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "18:00", 10)
    const slot2 = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "20:00", 10)
    const res1 = create_reservation(2, CURRENT_TIME_MS, SEED_BUSINESS_ID, SEED_USER_ID, slot1)
    const res2 = create_reservation(4, CURRENT_TIME_MS, SEED_BUSINESS_ID, SEED_USER_ID, slot2)

    //  --  act
    const result = find_reservations(SEED_USER_ID)

    //  --  assert
    const sorted = [...result].sort((a, b) => a.party_size - b.party_size)
    expect(sorted).toEqual([
      {
        id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: "D6E7F8A9-B0C1-49D2-3E5F-F7081920314A",
        party_size: 2,
        status: "confirmed",
        notes: "Gluten-free breakfast needed",
        created_at: "2026-04-02 00:00:00",
        updated_at: "2026-04-02 00:00:00",
      },
      {
        id: res1.id,
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: slot1,
        party_size: 2,
        status: "confirmed",
        notes: null,
        created_at: "2024-03-19 12:00:00",
        updated_at: "2024-03-19 12:00:00",
      },
      {
        id: res2.id,
        business_id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        time_slot_id: slot2,
        party_size: 4,
        status: "confirmed",
        notes: null,
        created_at: "2024-03-19 12:00:00",
        updated_at: "2024-03-19 12:00:00",
      },
    ])
  })
})
