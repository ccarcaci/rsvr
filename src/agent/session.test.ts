import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clear_all_sessions, find_session, session_count, update_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

describe("session", () => {
  beforeEach(() => {
    clear_all_sessions()
  })

  afterEach(() => {
    clear_all_sessions()
  })

  describe("find_session", () => {
    test("creates_a_fresh_session_when_none_exists", () => {
      //  --  arrange
      const now = 1_000_000

      //  --  act
      const session = find_session(now, "user:1")

      //  --  assert
      expect(session.history).toEqual([])
      expect(session.last_active).toBe(now)
      expect(session_count()).toBe(1)
    })

    test("returns_existing_session_for_known_sender_key", () => {
      //  --  arrange
      const now = 1_000_000
      const session_a = find_session(now, "user:1")
      session_a.history.push({ role: "user", content: "hello" })

      //  --  act
      const session_b = find_session(now + 1000, "user:1")

      //  --  assert
      expect(session_b.history).toEqual([{ role: "user", content: "hello" }])
      expect(session_count()).toBe(1)
    })

    test("updates_last_active_on_read", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "user:1")

      //  --  act
      const session = find_session(t0 + 5000, "user:1")

      //  --  assert
      expect(session.last_active).toBe(t0 + 5000)
    })
  })

  describe("ttl_eviction", () => {
    test("evicts_sessions_older_than_30_minutes_on_find_session", () => {
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

  describe("cleanup_triggered_on_access", () => {
    test("cleanup_runs_during_find_session_not_on_a_timer", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "stale:1")
      find_session(t0, "stale:2")
      find_session(t0, "stale:3")
      expect(session_count()).toBe(3)

      //  --  act — no time passes, no cleanup
      // Access at time still within TTL
      const t_within = t0 + 1000
      find_session(t_within, "stale:1")
      expect(session_count()).toBe(3)

      //  --  act — time passes beyond TTL, trigger cleanup via find_session
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_expired, "fresh:1")

      //  --  assert — stale:2 and stale:3 evicted; stale:1 was refreshed at t_within so still alive
      // stale:1 last_active = t_within, stale:2 last_active = t0, stale:3 last_active = t0
      // at t_expired: t_expired - t_within = THIRTY_MINUTES_MS, which is not > TTL, so stale:1 survives
      expect(session_count()).toBe(2)
    })

    test("eviction_is_triggered_on_both_find_session_and_update_session", () => {
      //  --  arrange
      const t0 = 1_000_000
      find_session(t0, "old:1")
      find_session(t0, "old:2")

      //  --  act — trigger eviction via update_session
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      update_session(t_expired, "new:1", { history: [], last_active: t_expired })

      //  --  assert
      expect(session_count()).toBe(1)
    })
  })
})
