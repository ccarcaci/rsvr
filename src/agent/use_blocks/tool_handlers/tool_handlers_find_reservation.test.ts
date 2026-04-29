import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../../mock_module"
import { mock_db_module } from "./mock"

mock_module("./db/queries", () => mock_db_module)

import type { tool_handlers_find_reservation_result_type } from "../../types"
import { handle_find_reservation } from "./tool_handlers"

const USER_ID = "D5F7BA6A-19C2-42F3-8080-17F098BB807D"
const RESERVATION_ID = "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5"
const RESERVATION = {
  id: RESERVATION_ID,
  time_slot_id: "A9B0C1D2-E3F4-4C05-6B82-2031425DD7D7",
  party_size: 2,
  status: "confirmed",
  notes: null,
  created_at: "2026-04-02 00:00:00",
  business_id: "BUSINESS-ID",
  user_id: USER_ID,
  updated_at: "2026-04-02 00:00:00",
}

describe("tool_handlers", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  describe("handle_find_reservation", () => {
    test("returns_reservation_data_when_found", () => {
      //  --  arrange
      mock_db_module.find_reservation.mockReturnValue(RESERVATION)

      //  --  act
      const result = handle_find_reservation(USER_ID, {
        reservation_id: RESERVATION_ID,
      })

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const content = result.data.content as tool_handlers_find_reservation_result_type
        expect(content).toEqual({
          reservation_id: "CCDDEEEF-HBIC-4AE3-A9EA-55B5555555LB5",
          time_slot_id: "A9B0C1D2-E3F4-4C05-6B82-2031425DD7D7",
          party_size: 2,
          status: "confirmed",
          notes: null,
          created_at: "2026-04-02 00:00:00",
        })
      }
      expect(mock_db_module.find_reservation).toBeCalledWith(USER_ID, RESERVATION_ID)
    })

    test("returns_error_when_reservation_not_found", () => {
      //  --  arrange
      mock_db_module.find_reservation.mockReturnValue(null)

      //  --  act
      const result = handle_find_reservation(USER_ID, {
        reservation_id: RESERVATION_ID,
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("not found")
      }
      expect(mock_db_module.find_reservation).toBeCalledWith(USER_ID, RESERVATION_ID)
    })

    test("returns_error_when_db_throws", () => {
      //  --  arrange
      mock_db_module.find_reservation.mockImplementation(() => {
        throw new Error("db error")
      })

      //  --  act
      const result = handle_find_reservation(USER_ID, {
        reservation_id: RESERVATION_ID,
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Failed")
      }
      expect(mock_db_module.find_reservation).toBeCalledWith(USER_ID, RESERVATION_ID)
    })
  })
})
