import type { Context, Next } from "hono"
import { logger } from "../shared/logger"
import { configs } from "../config/args"

export const request_logger = async (c: Context, next: Next): Promise<void> => {
  const path = new URL(c.req.url).pathname

  // Skip /status logging unless enabled
  if (path === "/status" && !configs.log_status_endpoint) {
    await next()
    return
  }

  const started = Date.now()
  const method = c.req.method

  await next()

  const duration_ms = Date.now() - started
  const status = c.res.status

  logger.info("http request", { method, path, status, duration_ms })
}
