export type reservation_status_type = "confirmed" | "cancelled"

export type reservation_type = {
  id: number
  user_id: number
  time_slot_id: number
  domain: string
  party_size: number
  status: reservation_status_type
  notes: string | null
  created_at: string
}

export type time_slot_type = {
  id: number
  domain: string
  date: string
  time: string
  capacity: number
  booked: number
}
