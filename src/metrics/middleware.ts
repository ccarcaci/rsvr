import type { Context, Next } from "hono"
import { registry } from "./registry"

// Hono middleware that records HTTP request metrics for every request.
// Mount this before all routes so every handled request is counted.
export const metrics_middleware = async (c: Context, next: Next): Promise<void> => {
  const started = Date.now()
  await next()
  const duration_ms = Date.now() - started

  // Normalise the path so high-cardinality IDs don't blow up the by_path map.
  // We keep the raw pathname; callers that want ID-based normalisation can
  // extend this later.
  const path = new URL(c.req.url).pathname
  const method = c.req.method
  const status = c.res.status

  registry.record_request(method, path, status, duration_ms)
}
