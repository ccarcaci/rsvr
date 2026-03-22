import { timingSafeEqual } from "node:crypto"
import type { Context, MiddlewareHandler } from "hono"
import { logger } from "../shared/logger"

const compare_api_keys = (provided: string | undefined, expected: string): boolean => {
  // If provided key is missing, reject immediately without timing info leak
  if (provided === undefined) {
    return false
  }

  // If lengths differ, reject without timing leak. timingSafeEqual requires
  // equal-length buffers; a length mismatch would itself reveal information,
  // so we compare lengths first to prevent timing attacks on key length.
  if (provided.length !== expected.length) {
    return false
  }

  // Both strings are same length; use timing-safe comparison to prevent
  // character-by-character timing attacks that could leak key bytes.
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  } catch {
    // timingSafeEqual throws if buffers are different lengths (shouldn't happen
    // given the check above, but handle gracefully)
    return false
  }
}

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

    // Check API key using timing-safe comparison to prevent timing attacks
    const provided_key = c.req.header("x-internal-api-key")
    const key_is_valid = compare_api_keys(provided_key, internal_api_key)

    if (!key_is_valid) {
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
