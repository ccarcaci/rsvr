import { get_db } from "./client"
import {
  type business_row_type,
  capacity_error,
  type reservation_row_type,
  slot_not_found_error,
  type time_slot_row_type,
  type user_row_type,
} from "./types"

export const cancel_reservation = (user_id: string, reservation_id: string): boolean => {
  const reservation = get_db()
    .query<reservation_row_type, [string, string]>(
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
    .query("UPDATE time_slots SET reserved = reserved - ? WHERE id = ?")
    .run(reservation.party_size, reservation.time_slot_id)

  return true
}

export const check_availability = (
  business_id: string,
  date: string,
  time: string,
  party_size: number,
): time_slot_row_type | null => {
  return get_db()
    .query<time_slot_row_type, [string, string, string, number]>(
      "SELECT * FROM time_slots WHERE business_id = ? AND date = ? AND time = ? AND (capacity - reserved) >= ?",
    )
    .get(business_id, date, time, party_size)
}

// Requires 6 parameters because a reservation spans users, time slots, businesses,
// and party details — each represents a distinct entity/value in the domain model.
export const create_reservation = (
  party_size: number,
  current_time_ms: number,
  business_id: string,
  user_id: string,
  time_slot_id: string,
  notes?: string,
): reservation_row_type => {
  const run_transaction = get_db().transaction(() => {
    // 1. Read slot inside transaction (under write lock via IMMEDIATE)
    const slot = get_db()
      .query<time_slot_row_type, [string]>("SELECT * FROM time_slots WHERE id = ?")
      .get(time_slot_id)
    if (!slot) {
      throw new slot_not_found_error(time_slot_id)
    }

    // 2. Check capacity atomically
    const remaining = slot.capacity - slot.reserved
    if (remaining < party_size) {
      throw new capacity_error(remaining)
    }

    // 3. Generate reservation ID and INSERT — timestamps derived from caller-supplied ms for determinism
    const reservation_id = crypto.randomUUID()
    const unix_seconds = current_time_ms / 1000
    get_db()
      .query(
        "INSERT INTO reservations (id, business_id, user_id, time_slot_id, party_size, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'))",
      )
      .run(reservation_id, business_id, user_id, time_slot_id, party_size, notes ?? null, unix_seconds, unix_seconds)

    // 4. UPDATE time_slots reserved count
    get_db()
      .query("UPDATE time_slots SET reserved = reserved + ? WHERE id = ?")
      .run(party_size, time_slot_id)

    // 5. Return the created reservation
    const result = get_db()
      .query<reservation_row_type, [string]>("SELECT * FROM reservations WHERE id = ?")
      .get(reservation_id)
    if (!result) {
      throw new Error(`Failed to find reservation after insert: ${reservation_id}`)
    }
    return result
  })

  // Execute with IMMEDIATE to acquire write lock upfront, preventing concurrent TOCTOU
  return run_transaction.immediate()
}

export const create_user = (
  channel: "whatsapp" | "telegram",
  identifier: string,
  name?: string,
): user_row_type => {
  const field = channel === "whatsapp" ? "phone" : "telegram_id"
  const user_id = crypto.randomUUID().toUpperCase()
  get_db()
    .query(`INSERT OR IGNORE INTO users (id, ${field}, channel, name) VALUES (?, ?, ?, ?)`)
    .run(user_id, identifier, channel, name ?? null)
  const user =
    channel === "whatsapp" ? find_user_by_phone(identifier) : find_user_by_telegram_id(identifier)
  if (!user) {
    throw new Error(`Failed to create or find user: ${identifier}`)
  }
  return user
}

export const find_businesses_by_name = (name: string): business_row_type[] => {
  return get_db()
    .query<business_row_type, [string]>("SELECT * FROM businesses WHERE LOWER(name) = LOWER(?)")
    .all(name)
}

export const find_reservation = (user_id: string, reservation_id: string): reservation_row_type | null => {
  return get_db()
    .query<reservation_row_type, [string, string]>("SELECT * FROM reservations WHERE user_id = ? AND id = ? ORDER BY created_at DESC",
    )
    .get(user_id, reservation_id)
}

export const find_reservations = (user_id: string): reservation_row_type[] => {
  return get_db()
    .query<reservation_row_type, [string]>(
      "SELECT * FROM reservations WHERE user_id = ? AND status = 'confirmed' ORDER BY created_at DESC",
    )
    .all(user_id)
}

export const find_slot_by_id = (slot_id: string): time_slot_row_type | null => {
  return get_db()
    .query<time_slot_row_type, [string]>("SELECT * FROM time_slots WHERE id = ?")
    .get(slot_id)
}

export const find_user_by_phone = (phone: string): user_row_type | null => {
  return get_db().query<user_row_type, [string]>("SELECT * FROM users WHERE phone = ?").get(phone)
}

export const find_user_by_telegram_id = (telegram_id: string): user_row_type | null => {
  return get_db()
    .query<user_row_type, [string]>("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegram_id)
}
