import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// Error classes for create_reservation tests
export class capacity_error extends Error {
  remaining: number
  constructor(remaining: number) {
    super(
      `Not enough capacity. Only ${remaining} ${remaining === 1 ? "seat" : "seats"} remain for that slot.`,
    )
    this.name = "capacity_error"
    this.remaining = remaining
  }
}

export class slot_not_found_error extends Error {
  constructor(slot_id: number) {
    super(`Slot ${slot_id} no longer exists.`)
    this.name = "slot_not_found_error"
  }
}

// Database setup
export const setup_db = (): Database => {
  const test_db = new Database(":memory:")
  test_db.exec("PRAGMA journal_mode = WAL")
  test_db.exec("PRAGMA foreign_keys = ON")

  const schema_path = resolve(import.meta.dir, "schema.sql")
  const schema = readFileSync(schema_path, "utf-8")
  test_db.exec(schema)
  return test_db
}

// Test data seeding
export const seed_user = (test_db: Database): number => {
  test_db
    .query("INSERT OR IGNORE INTO users (phone, channel, name) VALUES (?, ?, ?)")
    .run("+1234567890", "whatsapp", "Test User")
  const row = test_db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()
  return row?.id ?? 0
}

export const seed_slot = (
  test_db: Database,
  date: string,
  time: string,
  capacity: number,
  booked = 0,
): number => {
  test_db
    .query("INSERT INTO time_slots (date, time, capacity, booked) VALUES (?, ?, ?, ?)")
    .run(date, time, capacity, booked)
  const row = test_db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()
  return row?.id ?? 0
}

// Factory for create_reservation transaction test function
export const make_create_reservation = (test_db: Database) => {
  type time_slot_row_type = {
    id: number
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
    party_size: number
    status: string
    notes: string | null
    created_at: string
    updated_at: string
  }

  return (
    user_id: number,
    time_slot_id: number,
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
      const remaining = slot.capacity - slot.booked
      if (remaining < party_size) {
        throw new capacity_error(remaining)
      }
      const insert_result = test_db
        .query(
          "INSERT INTO reservations (user_id, time_slot_id, party_size, notes) VALUES (?, ?, ?, ?)",
        )
        .run(user_id, time_slot_id, party_size, notes ?? null)
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
