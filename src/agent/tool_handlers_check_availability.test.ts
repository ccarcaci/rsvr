import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"

import { mock_db_module } from "./mock"

const SLOT = {
  id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
  date: "2099-12-31",
  time: "19:00",
  capacity: 10,
  booked: 2,
  metadata: null,
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

  describe("handle_check_availability", () => {
    beforeEach(() => {
      mock_db_module.check_availability.mockReturnValue(null)
    })

    test("returns_slot_data_when_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(SLOT)

      //  --  act
      const result = handlers.handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const data = result.data as Record<string, unknown>
        expect(data.slot_id).toBe("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
        expect(data.date).toBe("2099-12-31")
        expect(data.time).toBe("19:00")
        expect(data.available_capacity).toBe(8)
      }
      expect(mock_db_module.check_availability).toBeCalledWith(
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "2099-12-31",
        "19:00",
        2,
      )
    })

    test("returns_error_when_no_slot_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(null)

      //  --  act
      const result = handlers.handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("No availability")
      }
      expect(mock_db_module.check_availability).toBeCalledWith(
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "2099-12-31",
        "19:00",
        2,
      )
    })

    test("rejects_invalid_date_format", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "31/12/2099",
        time: "19:00",
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Invalid date format")
      }
      expect(mock_db_module.check_availability).not.toHaveBeenCalled()
    })

    test("rejects_invalid_time_format", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "2099-12-31",
        time: "7pm",
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Invalid time format")
      }
      expect(mock_db_module.check_availability).not.toHaveBeenCalled()
    })

    test("defaults_party_size_to_1_when_not_provided", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      handlers.handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "2099-12-31",
        time: "19:00",
      })

      //  --  assert
      expect(mock_db_module.check_availability).toBeCalledWith(
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "2099-12-31",
        "19:00",
        1,
      )
    })
  })
})
