export type user_row_type = {
  channel: "whatsapp" | "telegram"
  id: string
  created_at: string
  name: string | null
  phone: string | null
  telegram_id: string | null
}

export type business_row_type = {
  id: string
  name: string | null
}

export type time_slot_row_type = {
  capacity: number
  reserved: number
  id: string
  business_id: string
  date: string
  time: string
  metadata: string | null
}

export type reservation_row_type = {
  party_size: number
  id: string
  business_id: string
  user_id: string
  time_slot_id: string
  status: string
  created_at: string
  updated_at: string
  notes: string | null
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
