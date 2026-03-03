import { mock } from "bun:test"

export const mock_anthropic_client = (impl: (...args: unknown[]) => unknown) => {
  mock.module("../parser/client/anthropic", () => ({
    client: {
      messages: {
        create: async (...args: unknown[]) => impl(...args),
      },
    },
  }))
}

export const mock_db_queries = (overrides: {
  check_availability?: (...args: unknown[]) => unknown
  create_reservation?: (...args: unknown[]) => unknown
  list_reservations?: (...args: unknown[]) => unknown
  get_slot_by_id?: (...args: unknown[]) => unknown
}) => {
  mock.module("../db/queries", () => ({
    check_availability: overrides.check_availability ?? (() => null),
    create_reservation:
      overrides.create_reservation ??
      (() => {
        throw new Error("not configured")
      }),
    list_reservations: overrides.list_reservations ?? (() => []),
    get_slot_by_id: overrides.get_slot_by_id ?? (() => null),
    // Unused stubs to satisfy the import
    find_user_by_phone: () => null,
    find_user_by_telegram_id: () => null,
    create_user: () => null,
    cancel_reservation: () => false,
  }))
}

mock_anthropic_client(async () => ({
  content: [],
  stop_reason: "end_turn",
  stop_sequence: null,
}))

mock_db_queries({})
