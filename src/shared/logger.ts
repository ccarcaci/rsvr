type json_entry = Record<string, unknown>

type log_level = "info" | "warn" | "error" | "debug"

const LEVEL_RANK: Record<log_level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const min_level = (process.env.LOG_LEVEL ?? "info") as log_level

const log = (level: log_level, message: string, data?: json_entry): void => {
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
  info: (message: string, data?: json_entry) => log("info", message, data),
  warn: (message: string, data?: json_entry) => log("warn", message, data),
  error: (message: string, data?: json_entry) => log("error", message, data),
  debug: (message: string, data?: json_entry) => log("debug", message, data),
}
