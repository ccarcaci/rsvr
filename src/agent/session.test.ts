import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { clear_all_sessions, get_session, session_count, update_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

beforeEach(() => {
  clear_all_sessions()
})

afterEach(() => {
  clear_all_sessions()
})

describe("get_session", () => {
  test("creates a fresh session when none exists", () => {
    //  --  arrange
    const now = 1_000_000

    //  --  act
    const session = get_session("user:1", now)

    //  --  assert
    expect(session.history).toEqual([])
    expect(session.last_active).toBe(now)
    expect(session_count()).toBe(1)
  })

  test("returns existing session for known sender_key", () => {
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

  test("updates last_active on read", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("user:1", t0)

    //  --  act
    const session = get_session("user:1", t0 + 5000)

    //  --  assert
    expect(session.last_active).toBe(t0 + 5000)
  })
})

describe("TTL eviction", () => {
  test("evicts sessions older than 30 minutes on get_session", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("old:1", t0)
    get_session("old:2", t0)

    //  --  act
    const t_after_ttl = t0 + THIRTY_MINUTES_MS + 1
    get_session("new:1", t_after_ttl)

    //  --  assert
    expect(session_count()).toBe(1)
  })

  test("evicts sessions older than 30 minutes on update_session", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("old:1", t0)

    //  --  act
    const t_after_ttl = t0 + THIRTY_MINUTES_MS + 1
    update_session(t_after_ttl, "new:1", { history: [], last_active: t_after_ttl })

    //  --  assert
    expect(session_count()).toBe(1)
  })

  test("does not evict sessions within 30-minute window", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("active:1", t0)

    //  --  act
    const t_within_ttl = t0 + THIRTY_MINUTES_MS - 1
    get_session("active:2", t_within_ttl)

    //  --  assert
    expect(session_count()).toBe(2)
  })

  test("does not evict session accessed exactly at TTL boundary", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("boundary:1", t0)

    //  --  act
    const t_exact = t0 + THIRTY_MINUTES_MS
    get_session("boundary:2", t_exact)

    //  --  assert
    expect(session_count()).toBe(2)
  })

  test("evicts only stale sessions, keeps active ones", () => {
    //  --  arrange
    const t0 = 1_000_000
    get_session("old:1", t0)
    get_session("recent:1", t0 + THIRTY_MINUTES_MS - 100)

    //  --  act
    const t_check = t0 + THIRTY_MINUTES_MS + 1
    get_session("trigger:1", t_check)

    //  --  assert
    expect(session_count()).toBe(2)
  })
})

describe("history capping", () => {
  test("caps history at 40 messages on update_session", () => {
    //  --  arrange
    const now = 1_000_000
    const long_history = Array.from({ length: 50 }, (_, i) => ({
      role: "user" as const,
      content: `message ${i}`,
    }))

    //  --  act
    update_session(now, "user:1", { history: long_history, last_active: now })
    const session = get_session("user:1", now)

    //  --  assert
    expect(session.history.length).toBe(40)
    // Should keep the most recent 40 (indices 10-49)
    expect(session.history[0]).toEqual({ role: "user", content: "message 10" })
    expect(session.history[39]).toEqual({ role: "user", content: "message 49" })
  })

  test("does not trim history at exactly 40 messages", () => {
    //  --  arrange
    const now = 1_000_000
    const exact_history = Array.from({ length: 40 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }))

    //  --  act
    update_session(now, "user:1", { history: exact_history, last_active: now })
    const session = get_session("user:1", now)

    //  --  assert
    expect(session.history.length).toBe(40)
    expect(session.history[0]).toEqual({ role: "user", content: "msg 0" })
  })

  test("does not trim history under 40 messages", () => {
    //  --  arrange
    const now = 1_000_000
    const short_history = Array.from({ length: 5 }, (_, i) => ({
      role: "user" as const,
      content: `msg ${i}`,
    }))

    //  --  act
    update_session(now, "user:1", { history: short_history, last_active: now })
    const session = get_session("user:1", now)

    //  --  assert
    expect(session.history.length).toBe(5)
  })
})

describe("cleanup triggered on access", () => {
  test("cleanup runs during get_session not on a timer", () => {
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

  test("eviction is triggered on both get_session and update_session", () => {
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
