import { beforeEach, describe, expect, mock, test } from "bun:test"
import { mock_db_module } from "./mock"

const SLOT = {
  id: 42,
  domain: "restaurant",
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
  domain: "restaurant",
  party_size: 2,
  status: "confirmed",
  notes: null,
  created_at: "2099-01-01T00:00:00",
  updated_at: "2099-01-01T00:00:00",
}

mock.module("../db/queries", () => mock_db_module)

const handlers = await import("./tool_handlers")

describe("tool_handlers", () => {
  describe("handle_check_availability", () => {
    beforeEach(() => {
      mock_db_module.check_availability.mockReturnValue(null)
    })

    test("returns_slot_data_when_available", () => {
      //  --  arrange
      mock_db_module.check_availability.mockReturnValue(SLOT)

      //  --  act
      const result = handlers.handle_check_availability({
        domain: "restaurant",
        date: "2099-12-31",
        time: "19:00",
        party_size: 2,
      })

      //  --  assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const data = result.data as Record<string, unknown>
        expect(data.slot_id).toBe(42)
        expect(data.domain).toBe("restaurant")
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
        domain: "restaurant",
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

    test("rejects_invalid_domain", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability({
        domain: "gym",
        date: "2099-12-31",
        time: "19:00",
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Invalid domain")
      }
    })

    test("rejects_invalid_date_format", () => {
      //  --  arrange
      // (no additional setup — default mock returns null)

      //  --  act
      const result = handlers.handle_check_availability({
        domain: "restaurant",
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
        domain: "restaurant",
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
        (_d: unknown, _dt: unknown, _t: unknown, ps: unknown) => {
          received_party_size = ps as number
          return SLOT
        },
      )

      //  --  act
      handlers.handle_check_availability({
        domain: "restaurant",
        date: "2099-12-31",
        time: "19:00",
      })

      //  --  assert
      expect(received_party_size).toBe(1)
    })
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
        domain: "restaurant",
        party_size: 2,
      })

      //  --  assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const data = result.data as Record<string, unknown>
        expect(data.reservation_id).toBe(99)
        expect(data.domain).toBe("restaurant")
        expect(data.party_size).toBe(2)
        expect(data.status).toBe("confirmed")
      }
    })

    test("rejects_invalid_domain", () => {
      //  --  arrange
      // (beforeEach sets up valid SLOT; domain validation fires before slot lookup)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        domain: "library",
        party_size: 1,
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain("Invalid domain")
      }
    })

    test("defaults_party_size_to_1_when_not_provided", () => {
      //  --  arrange
      let received_party_size = -1
      mock_db_module.create_reservation.mockImplementation(
        (_uid: unknown, _sid: unknown, ps: unknown, _ct: unknown, _d: unknown) => {
          received_party_size = ps as number
          return RESERVATION
        },
      )

      //  --  act
      handlers.handle_create_booking(1, 1000000, { slot_id: 42, domain: "restaurant" })

      //  --  assert
      expect(received_party_size).toBe(1)
    })

    test("accepts_notes_at_exactly_500_characters", () => {
      //  --  arrange
      const notes_500 = "a".repeat(500)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        domain: "restaurant",
        party_size: 1,
        notes: notes_500,
      })

      //  --  assert
      expect(result.ok).toBe(true)
    })

    test("rejects_notes_exceeding_500_characters", () => {
      //  --  arrange
      const notes_501 = "a".repeat(501)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        domain: "restaurant",
        party_size: 1,
        notes: notes_501,
      })

      //  --  assert
      expect(result.ok).toBe(false)
      if (!result.ok) {
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
        domain: "restaurant",
        party_size: 1,
        notes: notes_100,
      })

      //  --  assert
      expect(result.ok).toBe(true)
    })

    test("accepts_empty_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        domain: "restaurant",
        party_size: 1,
        notes: "",
      })

      //  --  assert
      expect(result.ok).toBe(true)
    })

    test("accepts_undefined_notes", () => {
      //  --  arrange
      // (no additional setup)

      //  --  act
      const result = handlers.handle_create_booking(1, 1000000, {
        slot_id: 42,
        domain: "restaurant",
        party_size: 1,
      })

      //  --  assert
      expect(result.ok).toBe(true)
    })
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
        expect(data.reservations[0].domain).toBe("restaurant")
      }
    })
  })
})
