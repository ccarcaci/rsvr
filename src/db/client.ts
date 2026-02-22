import { Database } from "bun:sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { logger } from "../shared/logger"

let db: Database

export const init_database = (db_path: string): Database => {
  const resolved_path = resolve(db_path)
  mkdirSync(dirname(resolved_path), { recursive: true })

  db = new Database(resolved_path)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")

  const schema_path = resolve(import.meta.dir, "schema.sql")
  const schema = readFileSync(schema_path, "utf-8")
  db.exec(schema)

  logger.info(`Database initialized at ${resolved_path}`)
  return db
}

export const get_database = (): Database => {
  if (!db) {
    throw new Error("Database not initialized. Call init_database() first.")
  }
  return db
}
