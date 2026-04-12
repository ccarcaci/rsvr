import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { clear_all_sessions, get_session, session_count, update_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

describe("session_get", () => {
  beforeEach(() => {
    clear_all_sessions()
  })

  afterEach(() => {
    clear_all_sessions()
  })

  describe("get_session", () => {
    test("creates_a_fresh_session_when_none_exists", () => {
      //  --  arrange
      const now = 1_000_000

      //  --  act
      const session = get_session("user:1", now)

      //  --  assert
      expect(session.history).toEqual([])
      expect(session.last_active).toBe(now)
      expect(session_count()).toBe(1)
    })

    test("returns_existing_session_for_known_sender_key", () => {
      //  --  arrange
      const now = 1_000_000
      const session_a = get_session("user:1", now)
      session_a.history.push({ role: "user", content: "hello" })

      //  --  act
      const session_b = get_session("user:1", now + 1000)

      //  --  assert
      expect(session_b.history).toEqual([{ role: "user", content: "hello" }])
      expect(session_count()).toBe(1)
    })

    test("updates_last_active_on_read", () => {
      //  --  arrange
      const t0 = 1_000_000
      get_session("user:1", t0)

      //  --  act
      const session = get_session("user:1", t0 + 5000)

      //  --  assert
      expect(session.last_active).toBe(t0 + 5000)
    })
  })

  describe("cleanup_triggered_on_access", () => {
    test("cleanup_runs_during_get_session_not_on_a_timer", () => {
      //  --  arrange
      const t0 = 1_000_000
      get_session("stale:1", t0)
      get_session("stale:2", t0)
      get_session("stale:3", t0)
      expect(session_count()).toBe(3)

      //  --  act — no time passes, no cleanup
      // Access at time still within TTL
      const t_within = t0 + 1000
      get_session("stale:1", t_within)
      expect(session_count()).toBe(3)

      //  --  act — time passes beyond TTL, trigger cleanup via get_session
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      get_session("fresh:1", t_expired)

      //  --  assert — stale:2 and stale:3 evicted; stale:1 was refreshed at t_within so still alive
      // stale:1 last_active = t_within, stale:2 last_active = t0, stale:3 last_active = t0
      // at t_expired: t_expired - t_within = THIRTY_MINUTES_MS, which is not > TTL, so stale:1 survives
      expect(session_count()).toBe(2)
    })

    test("eviction_is_triggered_on_both_get_session_and_update_session", () => {
      //  --  arrange
      const t0 = 1_000_000
      get_session("old:1", t0)
      get_session("old:2", t0)

      //  --  act — trigger eviction via update_session
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      update_session(t_expired, "new:1", { history: [], last_active: t_expired })

      //  --  assert
      expect(session_count()).toBe(1)
    })
  })
})
