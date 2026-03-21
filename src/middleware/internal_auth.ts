import type { Context, MiddlewareHandler } from "hono"
import { logger } from "../shared/logger"

export const create_internal_auth_middleware = (internal_api_key: string): MiddlewareHandler => {
  return async (c: Context, next) => {
    // Check localhost-only. Use ONLY the direct connection address, never trust
    // X-Forwarded-For header for security-sensitive endpoints. X-Forwarded-For can
    // be spoofed by attackers to bypass network restrictions.
    // In Bun, the socket.remoteAddress is on the raw request object.
    const socket = (c.req.raw as any)?.socket
    const remote_addr = socket?.remoteAddress || "unknown"

    const is_localhost =
      remote_addr === "127.0.0.1" ||
      remote_addr === "::1" ||
      remote_addr === "localhost" ||
      remote_addr.startsWith("127.") ||
      remote_addr.startsWith("::ffff:127.")

    if (!is_localhost) {
      logger.warn("Blocked internal endpoint access from non-localhost", {
        remote_addr,
        path: c.req.path,
      })
      return c.text("Forbidden", 403)
    }

    // Check API key
    const provided_key = c.req.header("x-internal-api-key")
    if (provided_key !== internal_api_key) {
      logger.warn("Blocked internal endpoint access with invalid API key", {
        remote_addr,
        path: c.req.path,
        key_present: provided_key !== undefined,
      })
      return c.text("Unauthorized", 401)
    }

    await next()
  }
}
