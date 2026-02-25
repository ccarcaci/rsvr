export type domain_type = "restaurant" | "doctor" | "salon"

export type reserve_intent_type = {
  action: "reserve"
  domain?: domain_type
  date?: string
  time?: string
  party_size?: number
  notes?: string
}

export type cancel_intent_type = {
  action: "cancel"
  reservation_id?: number
}

export type list_intent_type = {
  action: "list"
}

export type help_intent_type = {
  action: "help"
}

export type unknown_intent_type = {
  action: "unknown"
  raw_text: string
}

export type intent_type =
  | reserve_intent_type
  | cancel_intent_type
  | list_intent_type
  | help_intent_type
  | unknown_intent_type

export const is_reserve_intent = (i: intent_type): i is reserve_intent_type =>
  i.action === "reserve"

export const is_cancel_intent = (i: intent_type): i is cancel_intent_type => i.action === "cancel"

export const is_list_intent = (i: intent_type): i is list_intent_type => i.action === "list"

export const is_help_intent = (i: intent_type): i is help_intent_type => i.action === "help"
