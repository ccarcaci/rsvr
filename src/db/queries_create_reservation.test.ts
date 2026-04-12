import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { create_reservation } from "./queries"
import { seed_slot, setup_db } from "./queries_test_helpers"
import { capacity_error, slot_not_found_error } from "./types"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// Tests create additional slots for specific edge cases (capacity limits, exact capacity fills, etc).
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

const CURRENT_TIME_MS = 1710849600000

describe("create_reservation_transactional", () => {
  let test_db: Database
  let user_id: string
  let client_id: string

  beforeAll(() => {
    test_db = setup_db() // Load seed data
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))

    // Use clients and users from seed data
    client_id = "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C" // The Golden Fork Restaurant
    user_id = "D5F7BA6A-19C2-42F3-8080-17F098BB807D" // Alice Johnson
  })

  afterEach(() => {
    test_db.run("DELETE FROM reservations")
    test_db.run("DELETE FROM time_slots")
  })

  afterAll(() => {
    mock_restore()
  })

  test("creates_a_reservation_and_increments_booked_count", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-01", "19:00", 10)

    //  --  act
    const reservation = create_reservation(2, CURRENT_TIME_MS, client_id, user_id, slot_id)

    //  --  assert
    expect(reservation.user_id).toBe(user_id)
    expect(reservation.time_slot_id).toBe(slot_id)
    expect(reservation.party_size).toBe(2)
    expect(reservation.status).toBe("confirmed")

    const slot = test_db
      .query<{ booked: number }, [string]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(2)
  })

  test("throws_slot_not_found_error_when_slot_does_not_exist", () => {
    //  --  arrange
    const nonexistent_slot_id = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"

    //  --  act & assert
    expect(() =>
      create_reservation(1, CURRENT_TIME_MS, client_id, user_id, nonexistent_slot_id),
    ).toThrow(slot_not_found_error)
  })

  test("throws_capacity_error_when_party_size_exceeds_remaining_capacity", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-01", "20:00", 4, 3)

    //  --  act & assert
    expect(() => create_reservation(2, CURRENT_TIME_MS, client_id, user_id, slot_id)).toThrow(
      capacity_error,
    )
  })

  test("allows_booking_when_party_size_exactly_fills_remaining_capacity", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-01", "14:00", 3, 1)

    //  --  act
    const reservation = create_reservation(2, CURRENT_TIME_MS, client_id, user_id, slot_id)

    //  --  assert
    expect(reservation.party_size).toBe(2)
    const slot = test_db
      .query<{ booked: number }, [string]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(3)
  })

  test("rejects_booking_that_overflows_by_exactly_one_seat", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-01", "21:00", 5, 5)

    //  --  act & assert
    expect(() => create_reservation(1, CURRENT_TIME_MS, client_id, user_id, slot_id)).toThrow(
      capacity_error,
    )
  })

  test("sequential_bookings_respect_capacity_and_prevent_overbooking", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-02", "19:00", 4)

    //  --  act — first booking takes 3 seats
    const r1 = create_reservation(3, CURRENT_TIME_MS, client_id, user_id, slot_id)
    expect(r1.party_size).toBe(3)

    //  --  act — second booking tries 2 seats (only 1 remaining)
    expect(() => create_reservation(2, CURRENT_TIME_MS, client_id, user_id, slot_id)).toThrow(
      capacity_error,
    )

    //  --  assert — booked count should be 3, not 5
    const slot = test_db
      .query<{ booked: number }, [string]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(3)
  })

  test("rolls_back_reservation_if_capacity_check_fails_mid_transaction", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-03", "19:00", 2, 2)

    //  --  act
    expect(() => create_reservation(1, CURRENT_TIME_MS, client_id, user_id, slot_id)).toThrow(
      capacity_error,
    )

    //  --  assert — no reservation should have been created
    const reservations = test_db
      .query<{ id: string }, [string]>("SELECT id FROM reservations WHERE time_slot_id = ?")
      .all(slot_id)
    expect(reservations.length).toBe(0)

    //  --  assert — booked count unchanged
    const slot = test_db
      .query<{ booked: number }, [string]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(2)
  })

  test("creates_reservation_with_notes", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, client_id, "2026-04-05", "09:00", 1)

    //  --  act
    const reservation = create_reservation(
      1,
      CURRENT_TIME_MS,
      client_id,
      user_id,
      slot_id,
      "Annual checkup",
    )

    //  --  assert
    expect(reservation.notes).toBe("Annual checkup")
  })
})
