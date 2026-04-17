import type { session_entry_type } from "./types"

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_HISTORY = 40

const sessions = new Map<string, session_entry_type>()

//  --

const evict_expired = (current_time_ms: number): void => {
  for (const [key, entry] of sessions) {
    if (current_time_ms - entry.last_active > SESSION_TTL_MS) {
      sessions.delete(key)
    }
  }
}

//  --

export const get_session = (sender_key: string, current_time_ms: number): session_entry_type => {
  evict_expired(current_time_ms)

  const existing = sessions.get(sender_key)
  if (existing) {
    existing.last_active = current_time_ms
    return existing
  }

  const fresh: session_entry_type = { history: [], last_active: current_time_ms }
  sessions.set(sender_key, fresh)
  return fresh
}

export const update_session = (
  current_time_ms: number,
  sender_key: string,
  entry: session_entry_type,
): void => {
  evict_expired(current_time_ms)

  const capped_history =
    entry.history.length > MAX_HISTORY ? entry.history.slice(-MAX_HISTORY) : entry.history

  sessions.set(sender_key, {
    history: capped_history,
    last_active: current_time_ms,
    business_id: entry.business_id,
  })
}

export const clear_all_sessions = (): void => {
  sessions.clear()
}

export const session_count = (): number => sessions.size
