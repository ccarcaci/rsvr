import type { Database } from "bun:sqlite"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../mock_module"
import { create_user } from "./queries"
import { setup_db } from "./queries_test_helpers"

// Test database uses seed data from local_infra/seed_data.sql for realistic test environment.
// The seed data provides:
//   - 8 realistic users (WhatsApp + Telegram)
//   - 24 time slots across multiple dates/times
//   - 8 sample reservations

// Seed user IDs — excluded from afterEach cleanup so seed data is preserved between tests.
const SEED_USER_IDS = [
  "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
  "507259D3-B912-4DBE-9D87-D5F06741B021",
  "9E3F8082-CBD1-4518-BE90-9F69459DE02A",
  "0F3637B5-E508-45FD-B159-28E47CA7729F",
  "43A0E424-88DE-4232-9871-45C2FA55455B",
  "F8E9C3A2-D1B4-4F7E-9A2C-5B6D8E1F3A4B",
  "E7D8B2A1-C9F3-4E6D-8B1A-4C5D7E0F2A3B",
  "D6C7A1B0-B8E2-4D5C-7A9B-3C4D6E7F1A2B",
]

describe("create_user", () => {
  let test_db: Database

  beforeAll(() => {
    test_db = setup_db()
    mock_module("./db/client.ts", () => ({ get_db: () => test_db }))
  })

  afterEach(() => {
    const placeholders = SEED_USER_IDS.map(() => "?").join(",")
    test_db
      .query(`DELETE FROM users WHERE id NOT IN (${placeholders})`)
      .run(...(SEED_USER_IDS as [string, ...string[]]))
  })

  afterAll(() => {
    mock_restore()
  })

  test("creates_a_whatsapp_user_with_phone_and_name", () => {
    //  --  act
    const user = create_user("whatsapp", "+1 (555) 000-0001", "Test User")

    //  --  assert
    expect(user).toEqual({
      id: user.id,
      phone: "+1 (555) 000-0001",
      telegram_id: null,
      name: "Test User",
      channel: "whatsapp",
      created_at: user.created_at,
    })
  })

  test("creates_a_telegram_user_with_telegram_id_and_name", () => {
    //  --  act
    const user = create_user("telegram", "111222333", "Telegram User")

    //  --  assert
    expect(user).toEqual({
      id: user.id,
      phone: null,
      telegram_id: "111222333",
      name: "Telegram User",
      channel: "telegram",
      created_at: user.created_at,
    })
  })

  test("creates_user_without_name", () => {
    //  --  act
    const user = create_user("whatsapp", "+1 (555) 000-0002")

    //  --  assert
    expect(user).toEqual({
      id: user.id,
      phone: "+1 (555) 000-0002",
      telegram_id: null,
      name: null,
      channel: "whatsapp",
      created_at: user.created_at,
    })
  })

  test("returns_existing_user_when_whatsapp_phone_already_exists", () => {
    //  --  arrange (Alice Johnson is in seed data)

    //  --  act (INSERT OR IGNORE — phone already exists)
    const user = create_user("whatsapp", "+1 (555) 123-4567", "New Name")

    //  --  assert (original user returned, name unchanged)
    expect(user).toEqual({
      id: "D5F7BA6A-19C2-42F3-8080-17F098BB807D",
      phone: "+1 (555) 123-4567",
      telegram_id: null,
      name: "Alice Johnson",
      channel: "whatsapp",
      created_at: "2026-03-23 00:00:00",
    })
  })

  test("returns_existing_user_when_telegram_id_already_exists", () => {
    //  --  arrange (Frank Miller is in seed data)

    //  --  act (INSERT OR IGNORE — telegram_id already exists)
    const user = create_user("telegram", "987654321", "Duplicate")

    //  --  assert
    expect(user).toEqual({
      id: "F8E9C3A2-D1B4-4F7E-9A2C-5B6D8E1F3A4B",
      phone: null,
      telegram_id: "987654321",
      name: "Frank Miller",
      channel: "telegram",
      created_at: "2026-04-10 00:00:00",
    })
  })
})
