import { describe, expect, test } from "bun:test"
import { add_message_to_session, find_session } from "./session"

const THIRTY_MINUTES_MS = 30 * 60 * 1000

describe("add_message_to_session", () => {
  test("adds_message_to_existing_session", () => {
    //  --  arrange
    const now = 1_000_000
    find_session(now, "add_msg:user")

    //  --  act
    add_message_to_session(now, "add_msg:user", { role: "user", content: "hello" })

    //  --  assert
    const session = find_session(now, "add_msg:user")
    expect(session).toEqual([{ role: "user", content: "hello" }])
  })

  test("creates_session_when_none_exists", () => {
    //  --  arrange
    const now = 1_000_000

    //  --  act
    add_message_to_session(now, "add_msg_create:user", { role: "user", content: "hello" })

    //  --  assert
    const session = find_session(now, "add_msg_create:user")
    expect(session).toEqual([{ role: "user", content: "hello" }])
  })

  test("triggers_eviction_of_expired_sessions", () => {
    //  --  arrange
    const t0 = 1_000_000
    add_message_to_session(t0, "add_msd_evict:stale", { role: "user", content: "stale" })

    //  --  act
    const t_expired = t0 + THIRTY_MINUTES_MS + 1
    add_message_to_session(t_expired, "add_msg_evict:new", { role: "user", content: "new" })

    //  --  assert — evicted session is recreated fresh
    expect(find_session(t_expired, "add_msg_evict:stale")).toEqual([])
  })

  describe("history_capping", () => {
    test("caps_history_at_40_messages", () => {
      //  --  arrange
      const now = 1_000_000
      for (let i = 0; i < 50; i++) {
        add_message_to_session(now, "cap_history:user", { role: "user", content: `message ${i}` })
      }

      //  --  act
      const session = find_session(now, "cap_history:user")

      //  --  assert — keeps most recent 40 (indices 10–49)
      expect(session.length).toBe(40)
      expect(session[0]).toEqual({ role: "user", content: "message 10" })
      expect(session[39]).toEqual({ role: "user", content: "message 49" })
    })

    test("does_not_trim_history_at_exactly_40_messages", () => {
      //  --  arrange
      const now = 1_000_000
      for (let i = 0; i < 40; i++) {
        add_message_to_session(now, "exact_40:user", { role: "user", content: `msg ${i}` })
      }

      //  --  act
      const session = find_session(now, "exact_40:user")

      //  --  assert
      expect(session.length).toBe(40)
      expect(session[0]).toEqual({ role: "user", content: "msg 0" })
    })

    test("does_not_trim_history_under_40_messages", () => {
      //  --  arrange
      const now = 1_000_000
      for (let i = 0; i < 5; i++) {
        add_message_to_session(now, "under_40:user", { role: "user", content: `msg ${i}` })
      }

      //  --  act
      const session = find_session(now, "under_40:user")

      //  --  assert
      expect(session.length).toBe(5)
    })
  })
})
