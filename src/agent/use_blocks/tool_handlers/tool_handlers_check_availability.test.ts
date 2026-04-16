import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../../mock_module"
import { mock_db_module } from "./mock"

mock_module("./db/queries", () => mock_db_module)

import type { check_availability_content_type } from "../../types"
import { handle_check_availability } from "./tool_handlers"

const SLOT = {
  id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
  date: "2099-12-31",
  time: "19:00",
  capacity: 10,
  booked: 2,
  metadata: null,
}

describe("tool_handlers", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  describe("handle_check_availability", () => {
    test("returns_slot_data_when_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(SLOT)

      //  --  act
      const result = handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const content = result.data.content as check_availability_content_type
        expect(content).toEqual({
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          date: "2099-12-31",
          time: "19:00",
          available_capacity: 8,
        })
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
      const result = handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
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
      const result = handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
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
      const result = handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
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
      handle_check_availability("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C", {
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
