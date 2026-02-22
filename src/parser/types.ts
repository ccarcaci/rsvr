export type domain = "restaurant" | "doctor" | "salon"

export interface reserve_intent {
  action: "reserve"
  domain?: domain
  date?: string
  time?: string
  party_size?: number
  notes?: string
}

export interface cancel_intent {
  action: "cancel"
  reservation_id?: number
}

export interface list_intent {
  action: "list"
}

export interface help_intent {
  action: "help"
}

export interface unknown_intent {
  action: "unknown"
  raw_text: string
}

export type intent = reserve_intent | cancel_intent | list_intent | help_intent | unknown_intent

export const is_reserve_intent = (i: intent): i is reserve_intent => i.action === "reserve"

export const is_cancel_intent = (i: intent): i is cancel_intent => i.action === "cancel"

export const is_list_intent = (i: intent): i is list_intent => i.action === "list"

export const is_help_intent = (i: intent): i is help_intent => i.action === "help"
