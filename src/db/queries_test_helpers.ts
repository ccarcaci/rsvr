import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const try_seeding = (seed_path: string, test_db: Database) => {
  try {
    const seed_sql = readFileSync(seed_path, "utf-8")
    // Remove comments and SELECT statements from seed file
    const cleaned = seed_sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") && !line.includes("SELECT"))
      .join("\n")
    test_db.run(cleaned)
  } catch (err) {
    console.warn("Warning: could not load seed_data.sql", err)
  }
}

//  -

// Database setup
export const setup_db = (): Database => {
  const test_db = new Database(":memory:")
  test_db.run("PRAGMA journal_mode = WAL")
  test_db.run("PRAGMA foreign_keys = ON")

  const schema_path = resolve(import.meta.dir, "schema.sql")
  const schema = readFileSync(schema_path, "utf-8")
  test_db.run(schema)

  const seed_path = resolve(import.meta.dir, "../../local_infra/seed_data.sql")
  try_seeding(seed_path, test_db)

  return test_db
}

export const seed_slot = (
  test_db: Database,
  client_id: string,
  date: string,
  time: string,
  capacity: number,
  booked = 0,
): string => {
  const slot_id = crypto.randomUUID()
  test_db
    .query(
      "INSERT INTO time_slots (id, client_id, date, time, capacity, booked) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(slot_id, client_id, date, time, capacity, booked)
  return slot_id
}
