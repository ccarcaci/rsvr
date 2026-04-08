import { afterEach, describe, expect, mock, test } from "bun:test"

import { mock_db_module } from "./mock"

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

  describe("handle_list_bookings", () => {
    test("returns_empty_list_when_user_has_no_reservations", () => {
      //  --  arrange
      mock_db_module.list_reservations.mockReturnValue([])

      //  --  act
      const result = handlers.handle_list_bookings(1, {})

      //  --  assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const data = result.data as { reservations: unknown[] }
        expect(data.reservations).toHaveLength(0)
      }
    })

    test("returns_mapped_reservation_list", () => {
      //  --  arrange
      mock_db_module.list_reservations.mockReturnValue([RESERVATION])

      //  --  act
      const result = handlers.handle_list_bookings(1, {})

      //  --  assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const data = result.data as { reservations: Record<string, unknown>[] }
        expect(data.reservations).toHaveLength(1)
        expect(data.reservations[0].reservation_id).toBe(99)
      }
    })
  })
})
