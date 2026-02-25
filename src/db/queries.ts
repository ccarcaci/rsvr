import { db } from "./client"

export type user_row_type = {
  id: number
  phone: string | null
  telegram_id: string | null
  name: string | null
  channel: "whatsapp" | "telegram"
  created_at: string
}

export type time_slot_row_type = {
  id: number
  domain: string
  date: string
  time: string
  capacity: number
  booked: number
  metadata: string | null
}

export type reservation_row_type = {
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

export const find_user_by_phone = (phone: string): user_row_type | null => {
  return db.query<user_row_type, [string]>("SELECT * FROM users WHERE phone = ?").get(phone)
}

export const find_user_by_telegram_id = (telegram_id: string): user_row_type | null => {
  return db
    .query<user_row_type, [string]>("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegram_id)
}

export const create_user = (
  channel: "whatsapp" | "telegram",
  identifier: string,
  name?: string,
): user_row_type => {
  const field = channel === "whatsapp" ? "phone" : "telegram_id"
  db.query(`INSERT OR IGNORE INTO users (${field}, channel, name) VALUES (?, ?, ?)`).run(
    identifier,
    channel,
    name ?? null,
  )
  const user =
    channel === "whatsapp" ? find_user_by_phone(identifier) : find_user_by_telegram_id(identifier)
  if (!user) {
    throw new Error(`Failed to create or find user: ${identifier}`)
  }
  return user
}

export const check_availability = (
  domain: string,
  date: string,
  time: string,
  party_size: number,
): time_slot_row_type | null => {
  return db
    .query<time_slot_row_type, [string, string, string, number]>(
      "SELECT * FROM time_slots WHERE domain = ? AND date = ? AND time = ? AND (capacity - booked) >= ?",
    )
    .get(domain, date, time, party_size)
}

export const create_reservation = (
  user_id: number,
  time_slot_id: number,
  domain: string,
  party_size: number,
  notes?: string,
): reservation_row_type => {
  db.query(
    "INSERT INTO reservations (user_id, time_slot_id, domain, party_size, notes) VALUES (?, ?, ?, ?, ?)",
  ).run(user_id, time_slot_id, domain, party_size, notes ?? null)

  db.query("UPDATE time_slots SET booked = booked + ? WHERE id = ?").run(party_size, time_slot_id)

  const row = db.query<{ id: number }, []>("SELECT last_insert_rowid() as id").get()
  if (!row) {
    throw new Error("Failed to get last insert rowid")
  }
  const result = db
    .query<reservation_row_type, [number]>("SELECT * FROM reservations WHERE id = ?")
    .get(row.id)
  if (!result) {
    throw new Error(`Failed to find reservation after insert: ${row.id}`)
  }
  return result
}

export const cancel_reservation = (reservation_id: number): boolean => {
  const reservation = db
    .query<reservation_row_type, [number]>(
      "SELECT * FROM reservations WHERE id = ? AND status = 'confirmed'",
    )
    .get(reservation_id)

  if (!reservation) return false

  db.query(
    "UPDATE reservations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
  ).run(reservation_id)
  db.query("UPDATE time_slots SET booked = booked - ? WHERE id = ?").run(
    reservation.party_size,
    reservation.time_slot_id,
  )

  return true
}

export const list_reservations = (user_id: number): reservation_row_type[] => {
  return db
    .query<reservation_row_type, [number]>(
      "SELECT * FROM reservations WHERE user_id = ? AND status = 'confirmed' ORDER BY created_at DESC",
    )
    .all(user_id)
}
