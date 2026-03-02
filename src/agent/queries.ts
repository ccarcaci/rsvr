import { db } from "../db/client"
import type { reservation_row_type, time_slot_row_type } from "../db/queries"

export const get_slot_by_id = (slot_id: number): time_slot_row_type | null => {
  return db
    .query<time_slot_row_type, [number]>("SELECT * FROM time_slots WHERE id = ?")
    .get(slot_id)
}

export const get_reservation_by_id = (
  reservation_id: number,
  user_id: number,
): reservation_row_type | null => {
  return db
    .query<reservation_row_type, [number, number]>(
      "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
    )
    .get(reservation_id, user_id)
}
