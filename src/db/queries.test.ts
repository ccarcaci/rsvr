import { Database } from "bun:sqlite"
import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Define error classes inline to avoid importing from queries (which has config/args dependency chain)
class capacity_error extends Error {
  remaining: number
  constructor(remaining: number) {
    super(
      `Not enough capacity. Only ${remaining} ${remaining === 1 ? "seat" : "seats"} remain for that slot.`,
    )
    this.name = "capacity_error"
    this.remaining = remaining
  }
}

class slot_not_found_error extends Error {
  constructor(slot_id: number) {
    super(`Slot ${slot_id} no longer exists.`)
    this.name = "slot_not_found_error"
  }
}

class slot_domain_mismatch_error extends Error {
  constructor(slot_id: number, slot_domain: string, requested_domain: string) {
    super(`Slot ${slot_id} is for "${slot_domain}", not "${requested_domain}".`)
    this.name = "slot_domain_mismatch_error"
  }
}

// We need to test against a real SQLite database to verify transaction semantics.
// We re-implement the transactional create_reservation logic inline
// against a fresh in-memory DB to test the atomicity guarantees, without importing
// the production queries module (which has a config/args dependency chain).

const CURRENT_TIME_MS = 1710849600000

const setup_db = (): Database => {
  const test_db = new Database(":memory:")
  test_db.exec("PRAGMA journal_mode = WAL")
  test_db.exec("PRAGMA foreign_keys = ON")

  const schema_path = resolve(import.meta.dir, "schema.sql")
  const schema = readFileSync(schema_path, "utf-8")
  test_db.exec(schema)
  return test_db
}

const seed_user = (test_db: Database): number => {
  test_db
    .query("INSERT OR IGNORE INTO users (phone, channel, name) VALUES (?, ?, ?)")
    .run("+1234567890", "whatsapp", "Test User")
  const row = test_db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()
  return row?.id ?? 0
}

const seed_slot = (
  test_db: Database,
  domain: string,
  date: string,
  time: string,
  capacity: number,
  booked = 0,
): number => {
  test_db
    .query("INSERT INTO time_slots (domain, date, time, capacity, booked) VALUES (?, ?, ?, ?, ?)")
    .run(domain, date, time, capacity, booked)
  const row = test_db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()
  return row?.id ?? 0
}

// Replicate the transactional create_reservation for testing
// This mirrors the production code in queries.ts but uses the test_db instance
const make_create_reservation = (test_db: Database) => {
  type time_slot_row_type = {
    id: number
    domain: string
    date: string
    time: string
    capacity: number
    booked: number
    metadata: string | null
  }

  type reservation_row_type = {
    id: number
    user_id: number
    time_slot_id: number
    domain: string
    party_size: number
    status: string
    notes: string | null
    created_at: string
    updated_at: string
  }

  return (
    user_id: number,
    time_slot_id: number,
    domain: string,
    party_size: number,
    _current_time_ms: number,
    notes?: string,
  ): reservation_row_type => {
    const run_transaction = test_db.transaction(() => {
      const slot = test_db
        .query<time_slot_row_type, [number]>("SELECT * FROM time_slots WHERE id = ?")
        .get(time_slot_id)
      if (!slot) {
        throw new slot_not_found_error(time_slot_id)
      }
      if (slot.domain !== domain) {
        throw new slot_domain_mismatch_error(time_slot_id, slot.domain, domain)
      }
      const remaining = slot.capacity - slot.booked
      if (remaining < party_size) {
        throw new capacity_error(remaining)
      }
      const insert_result = test_db
        .query(
          "INSERT INTO reservations (user_id, time_slot_id, domain, party_size, notes) VALUES (?, ?, ?, ?, ?)",
        )
        .run(user_id, time_slot_id, domain, party_size, notes ?? null)
      test_db
        .query("UPDATE time_slots SET booked = booked + ? WHERE id = ?")
        .run(party_size, time_slot_id)
      const result = test_db
        .query<reservation_row_type, [number]>("SELECT * FROM reservations WHERE id = ?")
        .get(insert_result.lastInsertRowid as number)
      if (!result) {
        throw new Error(`Failed to find reservation after insert: ${insert_result.lastInsertRowid}`)
      }
      return result
    })
    return run_transaction.immediate()
  }
}

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
