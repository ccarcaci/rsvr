import type { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { find_clients_by_name } from "./queries"
import { setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// Tests create additional slots for specific edge cases (capacity limits, exact capacity fills, etc).
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

describe("find_clients_by_name", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_empty_array_when_no_clients_match", () => {
    //  --  arrange
    // (seed data already has clients)

    //  --  act
    const results = find_clients_by_name("Nonexistent Business")

    //  --  assert
    expect(results).toEqual([])
  })

  test("finds_client_with_exact_case_insensitive_match", () => {
    //  --  arrange
    // (seed data has "The Golden Fork Restaurant")

    //  --  act
    const results = find_clients_by_name("the golden fork restaurant")

    //  --  assert
    expect(results.length).toBe(1)
    expect(results[0].name).toBe("The Golden Fork Restaurant")
    expect(results[0].id.length).toBeGreaterThan(0)
  })

  test("returns_multiple_clients_when_multiple_match_exactly", () => {
    //  --  arrange
    // Insert two clients with the same name
    test_db
      .query("INSERT INTO client (id, name) VALUES (?, ?)")
      .run(`ID1-${crypto.randomUUID().substring(4)}`, "Test Duplicate Client")
    test_db
      .query("INSERT INTO client (id, name) VALUES (?, ?)")
      .run(`ID2-${crypto.randomUUID().substring(4)}`, "Test Duplicate Client")

    //  --  act
    const results = find_clients_by_name("Test Duplicate Client")

    //  --  assert
    expect(results.length).toBe(2)
    expect(results.every((c) => c.name === "Test Duplicate Client")).toBe(true)
  })

  test("does_not_return_partial_matches", () => {
    //  --  arrange
    // (seed data has "The Golden Fork Restaurant")

    //  --  act
    const results = find_clients_by_name("Golden Fork")

    //  --  assert
    expect(results).toEqual([])
  })
})
