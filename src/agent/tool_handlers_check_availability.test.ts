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

mock.module("../db/queries", () => mock_db_module)

// Import real tool_handlers AFTER mocking dependencies
const handlers = await import("./tool_handlers")

describe("tool_handlers", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  describe("handle_check_availability", () => {
    beforeEach(() => {
      mock_db_module.check_availability.mockReturnValue(null)
    })

    test("returns_slot_data_when_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(SLOT)

      //  --  act
      const result = handlers.handle_check_availability({
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const data = result.data as Record<string, unknown>
        expect(data.slot_id).toBe(42)
        expect(data.date).toBe("2099-12-31")
        expect(data.time).toBe("19:00")
        expect(data.available_capacity).toBe(8)
      }
    })

    test("returns_error_when_no_slot_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(null)

      //  --  act
      const result = handlers.handle_check_availability({
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("No availability")
      }
    })

    test("rejects_invalid_date_format", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability({
        date: "31/12/2099",
        time: "19:00",
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Invalid date format")
      }
    })

    test("rejects_invalid_time_format", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability({
        date: "2099-12-31",
        time: "7pm",
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Invalid time format")
      }
    })

    test("defaults_party_size_to_1_when_not_provided", () => {
      //  --  arrange
      let received_party_size = -1
      mock_db_module.check_availability.mockImplementation(
        (_dt: unknown, _t: unknown, ps: unknown) => {
          received_party_size = ps as number
          return SLOT
        },
      )

      //  --  act
      handlers.handle_check_availability({
        date: "2099-12-31",
        time: "19:00",
      })

      //  --  assert
      expect(received_party_size).toBe(1)
    })
  })
})
