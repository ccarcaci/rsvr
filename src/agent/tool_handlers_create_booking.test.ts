import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import { mock_db_module } from "./mock"

const SLOT = {
  id: 42,
  date: "2099-12-31",
  time: "19:00",
  capacity: 10,
  booked: 2,
  metadata: null,
}

const RESERVATION = {
  id: 99,
  user_id: 1,
  time_slot_id: 42,
  party_size: 2,
  status: "confirmed",
  notes: null,
  created_at: "2099-01-01T00:00:00",
  updated_at: "2099-01-01T00:00:00",
}

mock.module("../db/queries", () => mock_db_module)

// Import real tool_handlers AFTER mocking dependencies
const handlers = await import("./tool_handlers")

describe("tool_handlers", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  describe("handle_create_booking", () => {
    beforeEach(() => {
      mock_db_module.get_slot_by_id.mockReturnValue(SLOT)
      mock_db_module.create_reservation.mockReturnValue(RESERVATION)
    })

    test("creates_booking_when_slot_has_sufficient_capacity", () => {
      //  --  arrange
      // (beforeEach sets up SLOT with capacity 10, booked 2)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 2,
      })

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const data = result.data as Record<string, unknown>
        expect(data.reservation_id).toBe(99)
        expect(data.party_size).toBe(2)
        expect(data.status).toBe("confirmed")
      }
    })

    test("defaults_party_size_to_1_when_not_provided", () => {
      //  --  arrange
      let received_party_size = -1
      mock_db_module.create_reservation.mockImplementation(
        (_uid: unknown, _sid: unknown, ps: unknown, _ct: unknown) => {
          received_party_size = ps as number
          return RESERVATION
        },
      )

      //  --  act
      handlers.handle_create_booking(1, 1000000, { slot_id: 42 })

      //  --  assert
      expect(received_party_size).toBe(1)
    })

    test("accepts_notes_at_exactly_500_characters", () => {
      //  --  arrange
      const notes_500 = "a".repeat(500)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 1,
        notes: notes_500,
      })

      //  --  assert
      expect(result.status).toBe("success")
    })

    test("rejects_notes_exceeding_500_characters", () => {
      //  --  arrange
      const notes_501 = "a".repeat(501)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 1,
        notes: notes_501,
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Notes must not exceed 500 characters")
        expect(result.error).toContain("501")
      }
    })

    test("accepts_notes_under_500_characters", () => {
      //  --  arrange
      const notes_100 = `${"short notes here".repeat(6)} extra`

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 1,
        notes: notes_100,
      })

      //  --  assert
      expect(result.status).toBe("success")
    })

    test("accepts_empty_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 1,
        notes: "",
      })

      //  --  assert
      expect(result.status).toBe("success")
    })

    test("accepts_undefined_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        party_size: 1,
      })

      //  --  assert
      expect(result.status).toBe("success")
    })
  })
})
