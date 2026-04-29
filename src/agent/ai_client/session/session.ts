import { trace } from "../../../tracer/tracing"
import type { session_entry_type } from "../../types"
import { anthropic_api_message_type } from "../anthropic/types"

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_HISTORY = 40

const sessions = new Map<string, session_entry_type>()

//  --

const evict_expired = (current_time_ms: number): void => {
  trace("src/agent/ai_client/session/session", "evict_expired", current_time_ms)
  for (const [key, entry] of sessions) {
    if (current_time_ms - entry.last_active > SESSION_TTL_MS) {
      sessions.delete(key)
    }
  }
}

//  --

export const find_session = (current_time_ms: number, sender_key: string): anthropic_api_message_type => {
  trace("src/agent/ai_client/session/session", "find_session", current_time_ms, sender_key)
  evict_expired(current_time_ms)

  const existing = sessions.get(sender_key)
  if (existing) {
    existing.last_active = current_time_ms
    return existing
  }

  const fresh: session_entry_type = { history: [], last_active: current_time_ms }
  sessions.set(sender_key, fresh)
  return fresh.history
}

export const add_message_to_session = (current_time_ms: number, sender_key: string, api_message: anthropic_api_message_type) => {
  trace("src/agent/ai_client/session/session", "add_message_to_session", current_time_ms, sender_key, api_message)
  const existing_session = find_session(current_time_ms, sender_key)
  existing_session.history = [ ...existing_session.history, api_message ]
  const capped_history =
    existing_session.history.length > MAX_HISTORY ? existing_session.history.slice(-MAX_HISTORY) : existing_session.history
  sessions.set(sender_key, {
    history: capped_history,
    last_active: current_time_ms,
  })
}
