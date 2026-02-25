type json_entry_type = Record<string, unknown>

type log_level_type = "info" | "warn" | "error" | "debug"

const LEVEL_RANK: Record<log_level_type, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const min_level = (process.env.LOG_LEVEL ?? "info") as log_level_type

const log = (level: log_level_type, message: string, data?: json_entry_type): void => {
  if (LEVEL_RANK[level] < LEVEL_RANK[min_level]) return
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
  }
  if (data !== undefined) entry.data = data
  console[level](JSON.stringify(entry))
}

export const logger = {
  info: (message: string, data?: json_entry_type) => log("info", message, data),
  warn: (message: string, data?: json_entry_type) => log("warn", message, data),
  error: (message: string, data?: json_entry_type) => log("error", message, data),
  debug: (message: string, data?: json_entry_type) => log("debug", message, data),
}
