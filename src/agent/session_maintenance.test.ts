import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clear_all_sessions, find_session, session_count, update_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

describe("session_maintenance", () => {
  beforeEach(() => {
    clear_all_sessions()
  })

  afterEach(() => {
    clear_all_sessions()
  })

  describe("ttl_eviction", () => {
    test("evicts_sessions_older_than_30_minutes_on_get_session", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "old:1")
      find_session(t0, "old:2")

      //  --  act
      const t_after_ttl = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_after_ttl, "new:1")

      //  --  assert
      expect(session_count()).toBe(1)
    })

    test("evicts_sessions_older_than_30_minutes_on_update_session", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "old:1")

      //  --  act
      const t_after_ttl = t0 + THIRTY_MINUTES_MS + 1
      update_session(t_after_ttl, "new:1", { history: [], last_active: t_after_ttl })

      //  --  assert
      expect(session_count()).toBe(1)
    })

    test("does_not_evict_sessions_within_30_minute_window", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "active:1")

      //  --  act
      const t_within_ttl = t0 + THIRTY_MINUTES_MS - 1
      find_session(t_within_ttl, "active:2")

      //  --  assert
      expect(session_count()).toBe(2)
    })

    test("does_not_evict_session_accessed_exactly_at_ttl_boundary", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "boundary:1")

      //  --  act
      const t_exact = t0 + THIRTY_MINUTES_MS
      find_session(t_exact, "boundary:2")

      //  --  assert
      expect(session_count()).toBe(2)
    })

    test("evicts_only_stale_sessions_keeps_active_ones", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "old:1")
      find_session(t0 + THIRTY_MINUTES_MS - 100, "recent:1")

      //  --  act
      const t_check = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_check, "trigger:1")

      //  --  assert
      expect(session_count()).toBe(2)
    })
  })

  describe("history_capping", () => {
    test("caps_history_at_40_messages_on_update_session", () => {
      //  --  arrange
      const now = 1_000_000
      const long_history = Array.from({ length: 50 }, (_, i) => ({
        role: "user" as const,
        content: `message ${i}`,
      }))

      //  --  act
      update_session(now, "user:1", { history: long_history, last_active: now })
      const session = find_session(now, "user:1")

      //  --  assert
      expect(session.history.length).toBe(40)
      // Should keep the most recent 40 (indices 10-49)
      expect(session.history[0]).toEqual({ role: "user", content: "message 10" })
      expect(session.history[39]).toEqual({ role: "user", content: "message 49" })
    })

    test("does_not_trim_history_at_exactly_40_messages", () => {
      //  --  arrange
      const now = 1_000_000
      const exact_history = Array.from({ length: 40 }, (_, i) => ({
        role: "user" as const,
        content: `msg ${i}`,
      }))

      //  --  act
      update_session(now, "user:1", { history: exact_history, last_active: now })
      const session = find_session(now, "user:1")

      //  --  assert
      expect(session.history.length).toBe(40)
      expect(session.history[0]).toEqual({ role: "user", content: "msg 0" })
    })

    test("does_not_trim_history_under_40_messages", () => {
      //  --  arrange
      const now = 1_000_000
      const short_history = Array.from({ length: 5 }, (_, i) => ({
        role: "user" as const,
        content: `msg ${i}`,
      }))

      //  --  act
      update_session(now, "user:1", { history: short_history, last_active: now })
      const session = find_session(now, "user:1")

      //  --  assert
      expect(session.history.length).toBe(5)
    })
  })
})
