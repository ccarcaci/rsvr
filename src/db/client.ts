import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { configs } from "../config/args"
import { logger } from "../shared/logger"

// When compiled to a standalone binary via `bun build --compile`, import.meta.dir
// resolves to a virtual /$bunfs/root/... path that is not accessible via readFileSync.
// The Dockerfile copies schema.sql to /app/schema.sql so the compiled binary can
// always find it there. In local dev (bun run / bun test) the file sits next to
// this source file, so the relative path is tried first.
const get_schema_path = (): string => {
  const candidates = [
    resolve(import.meta.dir, "schema.sql"), // local dev: src/db/schema.sql
    "/app/schema.sql", //                     container: fixed path for compiled binary
  ]

  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {}
  }

  throw new Error(`schema.sql not found at any expected location: ${candidates.join(", ")}`)
}

const init_database = (db_path: string): Database => {
  const resolved_path = resolve(db_path)
  mkdirSync(dirname(resolved_path), { recursive: true })

  const db = new Database(resolved_path)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")

  const schema_path = get_schema_path()
  const schema = readFileSync(schema_path, "utf-8")
  db.exec(schema)

  logger.info(`Database initialized at ${resolved_path}`)
  return db
}

//  --

export const db = init_database(configs.database_path)
