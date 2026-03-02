import { beforeEach, describe, expect, it, mock } from "bun:test"

// Mutable state that mock functions delegate to — reassigned per test
let check_availability: (...args: unknown[]) => unknown = () => null
let create_reservation: (...args: unknown[]) => unknown = () => {
  throw new Error("not configured")
}
let list_reservations: (...args: unknown[]) => unknown = () => []
let get_slot_by_id: (...args: unknown[]) => unknown = () => null

// Register module mocks before any import of the module under test.
// The closures reference the mutable variables above, so reassigning them per test works.
mock.module("../db/queries", () => ({
  check_availability: (...args: unknown[]) => check_availability(...args),
  create_reservation: (...args: unknown[]) => create_reservation(...args),
  list_reservations: (...args: unknown[]) => list_reservations(...args),
  // Unused stubs to satisfy the import
  find_user_by_phone: () => null,
  find_user_by_telegram_id: () => null,
  create_user: () => null,
  cancel_reservation: () => false,
}))

mock.module("./queries", () => ({
  get_slot_by_id: (...args: unknown[]) => get_slot_by_id(...args),
  get_reservation_by_id: () => null,
}))

// Import must happen after mock.module registrations
const { handle_check_availability } = await import("./tool_handlers")
const { handle_create_booking } = await import("./tool_handlers")
const { handle_list_bookings } = await import("./tool_handlers")

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

describe("handle_check_availability", () => {
  beforeEach(() => {
    check_availability = () => null
  })

  it("returns slot data when available", () => {
    check_availability = () => SLOT

    const result = handle_check_availability({
      domain: "restaurant",
      date: "2099-12-31",
      time: "19:00",
      party_size: 2,
    })

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

  it("returns error when no slot available", () => {
    check_availability = () => null

    const result = handle_check_availability({
      domain: "restaurant",
      date: "2099-12-31",
      time: "19:00",
      party_size: 2,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("No availability")
    }
  })

  it("rejects invalid domain", () => {
    const result = handle_check_availability({
      domain: "gym",
      date: "2099-12-31",
      time: "19:00",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Invalid domain")
    }
  })

  it("rejects invalid date format", () => {
    const result = handle_check_availability({
      domain: "restaurant",
      date: "31/12/2099",
      time: "19:00",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Invalid date format")
    }
  })

  it("rejects invalid time format", () => {
    const result = handle_check_availability({
      domain: "restaurant",
      date: "2099-12-31",
      time: "7pm",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Invalid time format")
    }
  })

  it("defaults party_size to 1 when not provided", () => {
    let received_party_size = -1
    check_availability = (_d: unknown, _dt: unknown, _t: unknown, ps: unknown) => {
      received_party_size = ps as number
      return SLOT
    }

    handle_check_availability({ domain: "restaurant", date: "2099-12-31", time: "19:00" })
    expect(received_party_size).toBe(1)
  })
})

describe("handle_create_booking", () => {
  beforeEach(() => {
    get_slot_by_id = () => SLOT
    create_reservation = () => RESERVATION
  })

  it("creates booking when slot has sufficient capacity", () => {
    const result = handle_create_booking(1, {
      slot_id: 42,
      domain: "restaurant",
      party_size: 2,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as Record<string, unknown>
      expect(data.reservation_id).toBe(99)
      expect(data.domain).toBe("restaurant")
      expect(data.party_size).toBe(2)
      expect(data.status).toBe("confirmed")
    }
  })

  it("returns error when slot does not exist", () => {
    get_slot_by_id = () => null

    const result = handle_create_booking(1, {
      slot_id: 999,
      domain: "restaurant",
      party_size: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("no longer exists")
    }
  })

  it("returns error when slot domain does not match requested domain", () => {
    get_slot_by_id = () => ({ ...SLOT, domain: "salon" })

    const result = handle_create_booking(1, {
      slot_id: 42,
      domain: "restaurant",
      party_size: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("salon")
    }
  })

  it("returns error when remaining capacity is insufficient (race condition guard)", () => {
    // Slot has 3 total, 2 already booked = 1 remaining; requesting 3
    get_slot_by_id = () => ({ ...SLOT, capacity: 3, booked: 2 })

    const result = handle_create_booking(1, {
      slot_id: 42,
      domain: "restaurant",
      party_size: 3,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Not enough capacity")
    }
  })

  it("rejects invalid domain", () => {
    const result = handle_create_booking(1, {
      slot_id: 42,
      domain: "library",
      party_size: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Invalid domain")
    }
  })

  it("defaults party_size to 1 when not provided", () => {
    let received_party_size = -1
    create_reservation = (_uid: unknown, _sid: unknown, _d: unknown, ps: unknown) => {
      received_party_size = ps as number
      return RESERVATION
    }

    handle_create_booking(1, { slot_id: 42, domain: "restaurant" })
    expect(received_party_size).toBe(1)
  })
})

describe("handle_list_bookings", () => {
  it("returns empty list when user has no reservations", () => {
    list_reservations = () => []

    const result = handle_list_bookings(1, {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as { reservations: unknown[] }
      expect(data.reservations).toHaveLength(0)
    }
  })

  it("returns mapped reservation list", () => {
    list_reservations = () => [RESERVATION]

    const result = handle_list_bookings(1, {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      const data = result.data as { reservations: Record<string, unknown>[] }
      expect(data.reservations).toHaveLength(1)
      expect(data.reservations[0].reservation_id).toBe(99)
      expect(data.reservations[0].domain).toBe("restaurant")
    }
  })
})
