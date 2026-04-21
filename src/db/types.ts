export type user_row_type = {
  id: string
  phone: string | null
  telegram_id: string | null
  name: string | null
  channel: "whatsapp" | "telegram"
  created_at: string
}

export type business_row_type = {
  id: string
  name: string | null
}

export type time_slot_row_type = {
  id: string
  business_id: string
  date: string
  time: string
  capacity: number
  booked: number
  metadata: string | null
}

export type reservation_row_type = {
  id: string
  business_id: string
  user_id: string
  time_slot_id: string
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
  constructor(slot_id: string) {
    super(`Slot ${slot_id} no longer exists.`)
    this.name = "slot_not_found_error"
  }
}
