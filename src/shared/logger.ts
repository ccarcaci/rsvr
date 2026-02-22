type log_level = "info" | "warn" | "error" | "debug"

const timestamp = (): string => new Date().toISOString()

const log = (level: log_level, message: string, data?: unknown): void => {
  const entry = `[${timestamp()}] [${level.toUpperCase()}] ${message}`
  if (data !== undefined) {
    console[level](entry, data)
  } else {
    console[level](entry)
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log("info", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
  debug: (message: string, data?: unknown) => log("debug", message, data),
}
