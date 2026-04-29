import { describe, expect, test } from "bun:test"
import { find_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

describe("find_session", () => {
  test("creates_a_fresh_session_when_none_exists", () => {
    //  --  arrange
    const now = 1_000_000

    //  --  act
    const session = find_session(now, "fresh_create:user")

    //  --  assert
    expect(session.history).toEqual([])
    expect(session.last_active).toBe(now)
  })

  test("returns_existing_session_for_known_sender_key", () => {
    //  --  arrange
    const now = 1_000_000
    const session_a = find_session(now, "existing_key:user")
    session_a.history.push({ role: "user", content: "hello" })

    //  --  act
    const session_b = find_session(now + 1000, "existing_key:user")

    //  --  assert
    expect(session_b.history).toEqual([{ role: "user", content: "hello" }])
  })

  test("updates_last_active_on_read", () => {
    //  --  arrange
    const t0 = 1_000_000
    find_session(t0, "last_active_update:user")

    //  --  act
    const session = find_session(t0 + 5000, "last_active_update:user")

    //  --  assert
    expect(session.last_active).toBe(t0 + 5000)
  })

  describe("ttl_eviction", () => {
    test("evicts_session_older_than_30_minutes", () => {
      //  --  arrange
      const t0 = 1_000_000
      const stale = find_session(t0, "evict_old:stale")
      stale.history.push({ role: "user", content: "stale" })

      //  --  act
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_expired, "evict_old:trigger")

      //  --  assert — evicted session is recreated fresh
      expect(find_session(t_expired, "evict_old:stale").history).toEqual([])
    })

    test("does_not_evict_session_within_30_minute_window", () => {
      //  --  arrange
      const t0 = 1_000_000
      const active = find_session(t0, "within_ttl:user")
      active.history.push({ role: "user", content: "alive" })

      //  --  act
      find_session(t0 + THIRTY_MINUTES_MS - 1, "within_ttl:trigger")

      //  --  assert
      expect(find_session(t0 + THIRTY_MINUTES_MS - 1, "within_ttl:user").history).toEqual([
        { role: "user", content: "alive" },
      ])
    })

    test("does_not_evict_session_at_exactly_ttl_boundary", () => {
      //  --  arrange
      const t0 = 1_000_000
      const boundary = find_session(t0, "boundary_ttl:user")
      boundary.history.push({ role: "user", content: "alive" })

      //  --  act
      find_session(t0 + THIRTY_MINUTES_MS, "boundary_ttl:trigger")

      //  --  assert
      expect(find_session(t0 + THIRTY_MINUTES_MS, "boundary_ttl:user").history).toEqual([
        { role: "user", content: "alive" },
      ])
    })

    test("evicts_only_stale_sessions_keeps_active_ones", () => {
      //  --  arrange
      const t0 = 1_000_000
      const old_session = find_session(t0, "selective_evict:old")
      old_session.history.push({ role: "user", content: "old" })

      const recent_session = find_session(t0 + THIRTY_MINUTES_MS - 100, "selective_evict:recent")
      recent_session.history.push({ role: "user", content: "recent" })

      //  --  act — old expired, recent still within TTL
      const t_check = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_check, "selective_evict:trigger")

      //  --  assert
      expect(find_session(t_check, "selective_evict:old").history).toEqual([])
      expect(find_session(t_check, "selective_evict:recent").history).toEqual([
        { role: "user", content: "recent" },
      ])
    })
  })
})
