import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"

import { mock_db_module } from "./mock"

const RESERVATION = {
  id: "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D",
  user_id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
  time_slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
  party_size: 2,
  status: "confirmed",
  notes: null,
  created_at: "2099-01-01T00:00:00",
  updated_at: "2099-01-01T00:00:00",
}

describe("tool_handlers", () => {
  let handlers: typeof import("./tool_handlers")

  beforeAll(async () => {
    // Register mocks within describe block to prevent cross-test contamination.
    // When mocks are at module level, they persist globally and affect other test files
    // that import the same modules, causing them to receive mocked versions instead of real implementations.
    mock.module("../db/queries", () => mock_db_module)
    handlers = await import("./tool_handlers")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  describe("handle_list_bookings", () => {
    test("returns_empty_list_when_user_has_no_reservations", () => {
      //  --  arrange
      mock_db_module.find_reservations.mockReturnValue([])

      //  --  act
      const result = handlers.handle_list_bookings("D5F7BA6A-19C2-42F3-8080-17F098BB807D", {})

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const data = result.data as { reservations: unknown[] }
        expect(data.reservations).toHaveLength(0)
      }
      expect(mock_db_module.find_reservations).toBeCalledWith(
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      )
    })

    test("returns_mapped_reservation_list", () => {
      //  --  arrange
      mock_db_module.find_reservations.mockReturnValue([RESERVATION])

      //  --  act
      const result = handlers.handle_list_bookings("D5F7BA6A-19C2-42F3-8080-17F098BB807D", {})

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const data = result.data as { reservations: Record<string, unknown>[] }
        expect(data.reservations).toHaveLength(1)
        expect(data.reservations[0].reservation_id).toBe("A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D")
      }
      expect(mock_db_module.find_reservations).toBeCalledWith(
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      )
    })
  })
})
