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
    expect(session).toEqual([])
  })

  test("returns_existing_session_for_known_sender_key", () => {
    //  --  arrange
    const now = 1_000_000
    find_session(now, "existing_key:user").push({ role: "user", content: "hello" })

    //  --  act
    const session = find_session(now + 1000, "existing_key:user")

    //  --  assert
    expect(session).toEqual([{ role: "user", content: "hello" }])
  })

  test("updates_last_active_on_read", () => {
    //  --  arrange
    const t0 = 1_000_000
    find_session(t0, "last_active_update:user").push({ role: "user", content: "hello" })

    //  --  act — reading at t0+1 refreshes last_active; without the read the session would be evicted at t0+TTL+1
    find_session(t0 + 1, "last_active_update:user")
    find_session(t0 + THIRTY_MINUTES_MS + 1, "last_active_update:trigger")

    //  --  assert — session survives eviction because last_active was updated by the read
    expect(find_session(t0 + THIRTY_MINUTES_MS + 1, "last_active_update:user")).toEqual([
      { role: "user", content: "hello" },
    ])
  })

  describe("ttl_eviction", () => {
    test("evicts_session_older_than_30_minutes", () => {
      //  --  arrange
      const t0 = 1_000_000
      const stale = find_session(t0, "evict_old:stale")
      stale.push({ role: "user", content: "stale" })

      //  --  act
      const t_expired = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_expired, "evict_old:trigger")

      //  --  assert — evicted session is recreated fresh
      expect(find_session(t_expired, "evict_old:stale")).toEqual([])
    })

    test("does_not_evict_session_within_30_minute_window", () => {
      //  --  arrange
      const t0 = 1_000_000
      const active = find_session(t0, "within_ttl:user")
      active.push({ role: "user", content: "alive" })

      //  --  act
      find_session(t0 + THIRTY_MINUTES_MS - 1, "within_ttl:trigger")

      //  --  assert
      expect(find_session(t0 + THIRTY_MINUTES_MS - 1, "within_ttl:user")).toEqual([
        { role: "user", content: "alive" },
      ])
    })

    test("does_not_evict_session_at_exactly_ttl_boundary", () => {
      //  --  arrange
      const t0 = 1_000_000
      const boundary = find_session(t0, "boundary_ttl:user")
      boundary.push({ role: "user", content: "alive" })

      //  --  act
      find_session(t0 + THIRTY_MINUTES_MS, "boundary_ttl:trigger")

      //  --  assert
      expect(find_session(t0 + THIRTY_MINUTES_MS, "boundary_ttl:user")).toEqual([
        { role: "user", content: "alive" },
      ])
    })

    test("evicts_only_stale_sessions_keeps_active_ones", () => {
      //  --  arrange
      const t0 = 1_000_000
      const old_session = find_session(t0, "selective_evict:old")
      old_session.push({ role: "user", content: "old" })

      const recent_session = find_session(t0 + THIRTY_MINUTES_MS - 100, "selective_evict:recent")
      recent_session.push({ role: "user", content: "recent" })

      //  --  act — old expired, recent still within TTL
      const t_check = t0 + THIRTY_MINUTES_MS + 1
      find_session(t_check, "selective_evict:trigger")

      //  --  assert
      expect(find_session(t_check, "selective_evict:old")).toEqual([])
      expect(find_session(t_check, "selective_evict:recent")).toEqual([
        { role: "user", content: "recent" },
      ])
    })
  })
})
