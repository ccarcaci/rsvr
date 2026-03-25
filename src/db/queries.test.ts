import type { Database } from "bun:sqlite"
import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import {
  capacity_error,
  make_create_reservation,
  seed_slot,
  seed_user,
  setup_db,
  slot_domain_mismatch_error,
  slot_not_found_error,
} from "./queries_test_helpers"

// We need to test against a real SQLite database to verify transaction semantics.
// We re-implement the transactional create_reservation logic inline
// against a fresh in-memory DB to test the atomicity guarantees, without importing
// the production queries module (which has a config/args dependency chain).

const CURRENT_TIME_MS = 1710849600000

describe("create_reservation (transactional)", () => {
  let test_db: Database
  let user_id: number
  let create_reservation: ReturnType<typeof make_create_reservation>

  beforeAll(() => {
    test_db = setup_db()
    user_id = seed_user(test_db)
    create_reservation = make_create_reservation(test_db)
  })

  afterEach(() => {
    test_db.exec("DELETE FROM reservations")
    test_db.exec("DELETE FROM time_slots")
  })

  test("creates a reservation and increments booked count", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "restaurant", "2026-04-01", "19:00", 10)

    //  --  act
    const reservation = create_reservation(user_id, slot_id, "restaurant", 2, CURRENT_TIME_MS)

    //  --  assert
    expect(reservation.user_id).toBe(user_id)
    expect(reservation.time_slot_id).toBe(slot_id)
    expect(reservation.domain).toBe("restaurant")
    expect(reservation.party_size).toBe(2)
    expect(reservation.status).toBe("confirmed")

    const slot = test_db
      .query<{ booked: number }, [number]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(2)
  })

  test("throws slot_not_found_error when slot does not exist", () => {
    //  --  arrange
    const nonexistent_slot_id = 9999

    //  --  act & assert
    expect(() =>
      create_reservation(user_id, nonexistent_slot_id, "restaurant", 1, CURRENT_TIME_MS),
    ).toThrow(slot_not_found_error)
  })

  test("throws slot_domain_mismatch_error when domain does not match", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "doctor", "2026-04-01", "10:00", 5)

    //  --  act & assert
    expect(() => create_reservation(user_id, slot_id, "restaurant", 1, CURRENT_TIME_MS)).toThrow(
      slot_domain_mismatch_error,
    )
  })

  test("throws capacity_error when party_size exceeds remaining capacity", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "restaurant", "2026-04-01", "20:00", 4, 3)

    //  --  act & assert
    expect(() => create_reservation(user_id, slot_id, "restaurant", 2, CURRENT_TIME_MS)).toThrow(
      capacity_error,
    )
  })

  test("allows booking when party_size exactly fills remaining capacity", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "salon", "2026-04-01", "14:00", 3, 1)

    //  --  act
    const reservation = create_reservation(user_id, slot_id, "salon", 2, CURRENT_TIME_MS)

    //  --  assert
    expect(reservation.party_size).toBe(2)
    const slot = test_db
      .query<{ booked: number }, [number]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(3)
  })

  test("rejects booking that overflows by exactly one seat", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "restaurant", "2026-04-01", "21:00", 5, 5)

    //  --  act & assert
    expect(() => create_reservation(user_id, slot_id, "restaurant", 1, CURRENT_TIME_MS)).toThrow(
      capacity_error,
    )
  })

  test("sequential bookings respect capacity and prevent overbooking", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "restaurant", "2026-04-02", "19:00", 4)

    //  --  act — first booking takes 3 seats
    const r1 = create_reservation(user_id, slot_id, "restaurant", 3, CURRENT_TIME_MS)
    expect(r1.party_size).toBe(3)

    //  --  act — second booking tries 2 seats (only 1 remaining)
    expect(() => create_reservation(user_id, slot_id, "restaurant", 2, CURRENT_TIME_MS)).toThrow(
      capacity_error,
    )

    //  --  assert — booked count should be 3, not 5
    const slot = test_db
      .query<{ booked: number }, [number]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(3)
  })

  test("rolls back reservation if capacity check fails mid-transaction", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "restaurant", "2026-04-03", "19:00", 2, 2)

    //  --  act
    expect(() => create_reservation(user_id, slot_id, "restaurant", 1, CURRENT_TIME_MS)).toThrow(
      capacity_error,
    )

    //  --  assert — no reservation should have been created
    const reservations = test_db
      .query<{ id: number }, [number]>("SELECT id FROM reservations WHERE time_slot_id = ?")
      .all(slot_id)
    expect(reservations.length).toBe(0)

    //  --  assert — booked count unchanged
    const slot = test_db
      .query<{ booked: number }, [number]>("SELECT booked FROM time_slots WHERE id = ?")
      .get(slot_id)
    expect(slot?.booked).toBe(2)
  })

  test("creates reservation with notes", () => {
    //  --  arrange
    const slot_id = seed_slot(test_db, "doctor", "2026-04-05", "09:00", 1)

    //  --  act
    const reservation = create_reservation(
      user_id,
      slot_id,
      "doctor",
      1,
      CURRENT_TIME_MS,
      "Annual checkup",
    )

    //  --  assert
    expect(reservation.notes).toBe("Annual checkup")
  })
})
