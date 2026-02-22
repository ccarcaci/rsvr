export type reservation_status = "confirmed" | "cancelled"

export interface reservation {
  id: number
  user_id: number
  time_slot_id: number
  domain: string
  party_size: number
  status: reservation_status
  notes: string | null
  created_at: string
}

export interface time_slot {
  id: number
  domain: string
  date: string
  time: string
  capacity: number
  booked: number
}
