import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../../mock_module"
import { mock_db_module } from "./mock"

mock_module("./db/queries", () => mock_db_module)

import type { create_booking_content_type } from "../../types"
import { handle_create_booking } from "./tool_handlers"

const SLOT = {
  id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
  date: "2099-12-31",
  time: "19:00",
  capacity: 10,
  booked: 2,
  metadata: null,
}

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
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  describe("handle_create_booking", () => {
    beforeEach(() => {
      mock_db_module.find_slot_by_id.mockReturnValue(SLOT)
      mock_db_module.create_reservation.mockReturnValue(RESERVATION)
    })

    test("creates_booking_when_slot_has_sufficient_capacity", () => {
      //  --  arrange
      // (beforeEach sets up SLOT with capacity 10, booked 2)

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 2,
        },
      )

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const content = result.data.content as create_booking_content_type
        expect(content).toEqual({
          reservation_id: "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D",
          date: "2099-12-31",
          time: "19:00",
          party_size: 2,
          status: "confirmed",
          notes: null,
        })
      }
      expect(mock_db_module.create_reservation).toBeCalledWith(
        2,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        undefined,
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })

    test("defaults_party_size_to_1_when_not_provided", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        },
      )

      //  --  assert
      expect(mock_db_module.create_reservation).toBeCalledWith(
        1,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        undefined,
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })

    test("accepts_notes_at_exactly_500_characters", () => {
      //  --  arrange
      const notes_500 = "a".repeat(500)

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 1,
          notes: notes_500,
        },
      )

      //  --  assert
      expect(result.status).toBe("success")
      expect(mock_db_module.create_reservation).toBeCalledWith(
        1,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        notes_500,
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })

    test("rejects_notes_exceeding_500_characters", () => {
      //  --  arrange
      const notes_501 = "a".repeat(501)

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 1,
          notes: notes_501,
        },
      )

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Notes must not exceed 500 characters")
        expect(result.error).toContain("501")
      }
      expect(mock_db_module.create_reservation).not.toHaveBeenCalled()
      expect(mock_db_module.find_slot_by_id).not.toHaveBeenCalled()
    })

    test("accepts_notes_under_500_characters", () => {
      //  --  arrange
      const notes_100 = `${"short notes here".repeat(6)} extra`

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 1,
          notes: notes_100,
        },
      )

      //  --  assert
      expect(result.status).toBe("success")
      expect(mock_db_module.create_reservation).toBeCalledWith(
        1,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        notes_100,
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })

    test("accepts_empty_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 1,
          notes: "",
        },
      )

      //  --  assert
      expect(result.status).toBe("success")
      expect(mock_db_module.create_reservation).toBeCalledWith(
        1,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        "",
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })

    test("accepts_undefined_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handle_create_booking(
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        {
          slot_id: "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
          party_size: 1,
        },
      )

      //  --  assert
      expect(result.status).toBe("success")
      expect(mock_db_module.create_reservation).toBeCalledWith(
        1,
        1000000,
        "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
        "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
        "C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D",
        undefined,
      )
      expect(mock_db_module.find_slot_by_id).toBeCalledWith("C9F7A3D1-4E2B-4F1C-8A5D-7B9C2E6F1A3D")
    })
  })
})
