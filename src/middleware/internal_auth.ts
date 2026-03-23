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

const try_get_conn_info_address = (c: Context): string | null => {
  // Try getConnInfo first (requires Bun server context, not available in tests)
  // Dynamically import to avoid hard dependency on Bun runtime.
  // This is the recommended approach from Hono for Bun adapter.
  try {
    const { getConnInfo } = require("hono/bun")
    const conn_info = getConnInfo(c)
    if (conn_info?.remote?.address) {
      return conn_info.remote.address
    }
  } catch {
    // getConnInfo not available or failed; return null to try fallback
  }
  return null
}

const get_socket_address = (c: Context): string | null => {
  // Fallback: access the raw socket for testing and Bun environments
  // where getConnInfo may not be available.
  // remoteAddress is a property from the native Node.js/Bun socket interface
  // and cannot be renamed to snake_case.
  // biome-ignore lint/style/useNamingConvention: External API property from Node.js/Bun
  const raw_request = c.req.raw as { socket?: { remoteAddress?: string } }
  const socket = raw_request?.socket
  return socket?.remoteAddress || null
}

const get_remote_address = (c: Context): string => {
  // Try getConnInfo first, then socket, then return unknown
  return try_get_conn_info_address(c) || get_socket_address(c) || "unknown"
}

export const create_internal_auth_middleware = (internal_api_key: string): MiddlewareHandler => {
  return async (c: Context, next) => {
    // Check localhost-only. Use ONLY the direct connection address, never trust
    // X-Forwarded-For header for security-sensitive endpoints. X-Forwarded-For can
    // be spoofed by attackers to bypass network restrictions.
    // Uses get_remote_address which tries getConnInfo (Hono Bun helper) and
    // falls back to raw socket access for compatibility with tests.
    const remote_addr = get_remote_address(c)

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
