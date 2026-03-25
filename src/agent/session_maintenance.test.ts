import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

// Clear mocks from previous test files
mock.restore()

import { clear_all_sessions, get_session, session_count, update_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

beforeEach(() => {
  clear_all_sessions()
})

afterEach(() => {
  clear_all_sessions()
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
