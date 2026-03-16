import type { Context, Next } from "hono"
import { logger } from "../shared/logger"

//  Headers whose values must never appear in logs.
const REDACTED_HEADERS = new Set([
  "authorization",
  "x-api-key",
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
export const debug_request_logger = async (c: Context, next: Next): Promise<void> => {
  const url = new URL(c.req.url)
  const method = c.req.method
  const path = url.pathname
  const query = url.search

  const headers = redact_headers(c.req.raw.headers)

  let body: string | undefined
  const content_length = c.req.raw.headers.get("content-length")
  const has_body = content_length !== null ? parseInt(content_length) > 0 : false

  if (has_body || (method !== "GET" && method !== "HEAD" && method !== "OPTIONS")) {
    try {
      const raw_bytes = await c.req.raw.arrayBuffer()
      if (raw_bytes.byteLength > 0) {
        body = new TextDecoder().decode(raw_bytes)
        //  Replace the consumed stream with an identical fresh Request so
        //  downstream route handlers can still read the body normally.
        c.req.raw = new Request(c.req.raw, { body: raw_bytes })
      }
    } catch {
      body = "[unreadable]"
    }
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
