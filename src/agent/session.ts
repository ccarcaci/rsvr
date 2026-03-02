import type { session_entry_type } from "./types"

const sessions = new Map<string, session_entry_type>()

export const get_session = (sender_key: string): session_entry_type => {
  const existing = sessions.get(sender_key)
  if (existing) return existing
  const fresh: session_entry_type = { history: [], last_active: Date.now() }
  sessions.set(sender_key, fresh)
  return fresh
}

export const update_session = (sender_key: string, entry: session_entry_type): void => {
  sessions.set(sender_key, { ...entry, last_active: Date.now() })
}
