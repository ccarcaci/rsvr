import { get_db } from "./client"

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

export class slot_domain_mismatch_error extends Error {
  constructor(slot_id: number, slot_domain: string, requested_domain: string) {
    super(`Slot ${slot_id} is for "${slot_domain}", not "${requested_domain}".`)
    this.name = "slot_domain_mismatch_error"
  }
}

export const find_user_by_phone = (phone: string): user_row_type | null => {
  return get_db().query<user_row_type, [string]>("SELECT * FROM users WHERE phone = ?").get(phone)
}

export const find_user_by_telegram_id = (telegram_id: string): user_row_type | null => {
  return get_db()
    .query<user_row_type, [string]>("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegram_id)
}

export const create_user = (
  channel: "whatsapp" | "telegram",
  identifier: string,
  name?: string,
): user_row_type => {
  const field = channel === "whatsapp" ? "phone" : "telegram_id"
  get_db()
    .query(`INSERT OR IGNORE INTO users (${field}, channel, name) VALUES (?, ?, ?)`)
    .run(identifier, channel, name ?? null)
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
  return get_db()
    .query<time_slot_row_type, [string, string, string, number]>(
      "SELECT * FROM time_slots WHERE domain = ? AND date = ? AND time = ? AND (capacity - booked) >= ?",
    )
    .get(domain, date, time, party_size)
}

export const create_reservation = (
  user_id: number,
  time_slot_id: number,
  party_size: number,
  _current_time_ms: number,
  domain: string,
  notes?: string,
): reservation_row_type => {
  const run_transaction = get_db().transaction(() => {
    // 1. Read slot inside transaction (under write lock via IMMEDIATE)
    const slot = get_db()
      .query<time_slot_row_type, [number]>("SELECT * FROM time_slots WHERE id = ?")
      .get(time_slot_id)
    if (!slot) {
      throw new slot_not_found_error(time_slot_id)
    }

    // 2. Validate domain match
    if (slot.domain !== domain) {
      throw new slot_domain_mismatch_error(time_slot_id, slot.domain, domain)
    }

    // 3. Check capacity atomically
    const remaining = slot.capacity - slot.booked
    if (remaining < party_size) {
      throw new capacity_error(remaining)
    }

    // 4. INSERT reservation
    const insert_result = get_db()
      .query(
        "INSERT INTO reservations (user_id, time_slot_id, domain, party_size, notes) VALUES (?, ?, ?, ?, ?)",
      )
      .run(user_id, time_slot_id, domain, party_size, notes ?? null)

    // 5. UPDATE time_slots booked count
    get_db()
      .query("UPDATE time_slots SET booked = booked + ? WHERE id = ?")
      .run(party_size, time_slot_id)

    // 6. Return the created reservation
    const result = get_db()
      .query<reservation_row_type, [number]>("SELECT * FROM reservations WHERE id = ?")
      .get(insert_result.lastInsertRowid as number)
    if (!result) {
      throw new Error(`Failed to find reservation after insert: ${insert_result.lastInsertRowid}`)
    }
    return result
  })

  // Execute with IMMEDIATE to acquire write lock upfront, preventing concurrent TOCTOU
  return run_transaction.immediate()
}

export const cancel_reservation = (user_id: number, reservation_id: number): boolean => {
  const reservation = get_db()
    .query<reservation_row_type, [number, number]>(
      "SELECT * FROM reservations WHERE id = ? AND user_id = ? AND status = 'confirmed'",
    )
    .get(reservation_id, user_id)

  if (!reservation) return false

  get_db()
    .query(
      "UPDATE reservations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND user_id = ?",
    )
    .run(reservation_id, user_id)
  get_db()
    .query("UPDATE time_slots SET booked = booked - ? WHERE id = ?")
    .run(reservation.party_size, reservation.time_slot_id)

  return true
}

export const list_reservations = (user_id: number): reservation_row_type[] => {
  return get_db()
    .query<reservation_row_type, [number]>(
      "SELECT * FROM reservations WHERE user_id = ? AND status = 'confirmed' ORDER BY created_at DESC",
    )
    .all(user_id)
}

export const get_slot_by_id = (slot_id: number): time_slot_row_type | null => {
  return get_db()
    .query<time_slot_row_type, [number]>("SELECT * FROM time_slots WHERE id = ?")
    .get(slot_id)
}
