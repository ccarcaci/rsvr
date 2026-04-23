import type { Context, Next } from "hono"
import { configs } from "../config/args"
import { logger } from "../shared/logger"
import { enable_trace } from "../tracer/tracing"

//  Headers whose values must never appear in logs.
const REDACTED_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "x-internal-api-key",
  "cookie",
  "set-cookie",
  "x-hub-signature",
  "x-hub-signature-256",
])

const redact_headers = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? "[REDACTED]" : value
  })
  return result
}

//  Middleware that logs the full raw HTTP request.
//  Mount BEFORE all routes and only when debug mode is enabled.
//
//  Body handling: we read the raw body bytes once, log them, then replace
//  c.req.raw with a new Request carrying the same bytes so downstream
//  handlers (e.g. c.req.json(), c.req.text()) read from a fresh stream.
const try_read_request_body = async (c: Context): Promise<string | undefined> => {
  try {
    const raw_bytes = await c.req.raw.arrayBuffer()
    if (raw_bytes.byteLength > 0) {
      const body = new TextDecoder().decode(raw_bytes)
      //  Replace the consumed stream with an identical fresh Request so
      //  downstream route handlers can still read the body normally.
      c.req.raw = new Request(c.req.raw, { body: raw_bytes })
      return body
    }
    return undefined
  } catch {
    return "[unreadable]"
  }
}

export const debug_request_logger = async (c: Context, next: Next): Promise<void> => {
  const url = new URL(c.req.url)
  const path = url.pathname

  if (path === "/status" && !configs.log_status_endpoint) {
    await next()
    return
  }

  const query = url.search
  const method = c.req.method

  const headers = redact_headers(c.req.raw.headers)

  let body: string | undefined
  const content_length = c.req.raw.headers.get("content-length")
  const has_body = content_length !== null ? parseInt(content_length, 10) > 0 : false

  if (has_body || (method !== "GET" && method !== "HEAD" && method !== "OPTIONS")) {
    body = await try_read_request_body(c)
  }

  logger.debug("incoming request", {
    method,
    path,
    query: query || undefined,
    headers,
    body,
  })

  await next()
}
