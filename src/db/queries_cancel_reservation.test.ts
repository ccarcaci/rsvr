import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { cancel_reservation, create_reservation } from "./queries"
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

describe("cancel_reservation", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_false_when_reservation_not_found", () => {
    //  --  act
    const result = cancel_reservation(SEED_USER_ID, "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")

    //  --  assert
    expect(result).toBe(false)
  })

  test("returns_false_when_reservation_belongs_to_different_user", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "12:00", 10)
    const reservation = create_reservation(
      2,
      CURRENT_TIME_MS,
      SEED_BUSINESS_ID,
      SEED_USER_ID,
      slot_id,
    )

    //  --  act (SEED_OTHER_SEED_USER_ID tries to cancel Alice's reservation)
    const result = cancel_reservation(SEED_OTHER_SEED_USER_ID, reservation.id)

    //  --  assert
    expect(result).toBe(false)
  })

  test("returns_true_and_decrements_reserved_count_on_successful_cancellation", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-01", "19:00", 10)
    const reservation = create_reservation(
      3,
      CURRENT_TIME_MS,
      SEED_BUSINESS_ID,
      SEED_USER_ID,
      slot_id,
    )

    //  --  act
    const result = cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  assert
    expect(result).toBe(true)
    const slot = test_db
      .query<{ reserved: number }, [string]>("SELECT reserved FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot).toEqual({ reserved: 0 })
  })

  test("sets_reservation_status_to_cancelled", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-02", "09:00", 5)
    const reservation = create_reservation(
      1,
      CURRENT_TIME_MS,
      SEED_BUSINESS_ID,
      SEED_USER_ID,
      slot_id,
    )

    //  --  act
    cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  assert
    const row = test_db
      .query<{ status: string }, [string]>("SELECT status FROM reservations WHERE id = ?")
      .get(reservation.id)
    expect(row).toEqual({ status: "cancelled" })
  })

  test("returns_false_when_reservation_already_cancelled", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, SEED_BUSINESS_ID, "2026-05-03", "20:00", 5)
    const reservation = create_reservation(
      1,
      CURRENT_TIME_MS,
      SEED_BUSINESS_ID,
      SEED_USER_ID,
      slot_id,
    )
    cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  act (cancel again)
    const result = cancel_reservation(SEED_USER_ID, reservation.id)

    //  --  assert
    expect(result).toBe(false)
  })
})
