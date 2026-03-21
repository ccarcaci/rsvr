import { Hono } from "hono"
import { get_db } from "../db/client"
import { registry } from "./registry"

// ---- helpers ----

const db_ping = (): { ok: boolean; error?: string } => {
  try {
    const db = get_db()
    db.query("SELECT 1").get()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Renders metrics in Prometheus text exposition format 0.0.4.
// Content-Type: text/plain; version=0.0.4; charset=utf-8
// Ref: https://prometheus.io/docs/instrumenting/exposition_formats/
// NOTE: Function exceeds 50-line limit because Prometheus format requires explicit HELP
// and TYPE lines for each metric. Extracting these as a separate function/loop would
// reduce clarity; the linear structure is intentional and mirrors the metric declaration.
const render_prometheus = (): string => {
  const snap = registry.snapshot()
  const uptime_seconds = (Date.now() - snap.started_at) / 1000
  const lines: string[] = []

  const line = (...parts: string[]) => lines.push(...parts)

  // process uptime
  line(
    "# HELP rsvr_uptime_seconds Time in seconds since the process started",
    "# TYPE rsvr_uptime_seconds gauge",
    `rsvr_uptime_seconds ${uptime_seconds.toFixed(3)}`,
  )

  // http request total
  line(
    "# HELP rsvr_http_requests_total Total number of HTTP requests received",
    "# TYPE rsvr_http_requests_total counter",
    `rsvr_http_requests_total ${snap.http_requests.total}`,
  )

  // http error total (5xx)
  line(
    "# HELP rsvr_http_errors_total Total number of HTTP 5xx responses",
    "# TYPE rsvr_http_errors_total counter",
    `rsvr_http_errors_total ${snap.http_requests.errors}`,
  )

  // requests by status code
  line(
    "# HELP rsvr_http_requests_by_status_total HTTP requests broken down by status code",
    "# TYPE rsvr_http_requests_by_status_total counter",
  )
  for (const [status, count] of Object.entries(snap.http_requests.by_status)) {
    line(`rsvr_http_requests_by_status_total{status="${status}"} ${count}`)
  }

  // requests by method
  line(
    "# HELP rsvr_http_requests_by_method_total HTTP requests broken down by method",
    "# TYPE rsvr_http_requests_by_method_total counter",
  )
  for (const [method, count] of Object.entries(snap.http_requests.by_method)) {
    line(`rsvr_http_requests_by_method_total{method="${method}"} ${count}`)
  }

  // latency histogram
  line(
    "# HELP rsvr_http_request_duration_ms HTTP request duration in milliseconds",
    "# TYPE rsvr_http_request_duration_ms histogram",
  )
  for (const bucket of snap.http_latency.buckets) {
    line(`rsvr_http_request_duration_ms_bucket{le="${bucket.le}"} ${bucket.count}`)
  }
  line(
    `rsvr_http_request_duration_ms_bucket{le="+Inf"} ${snap.http_latency.count}`,
    `rsvr_http_request_duration_ms_sum ${snap.http_latency.sum_ms.toFixed(3)}`,
    `rsvr_http_request_duration_ms_count ${snap.http_latency.count}`,
  )

  // Prometheus text format requires a trailing newline
  lines.push("")
  return lines.join("\n")
}

// ---- routes ----

const create_monitoring_routes = (): Hono => {
  const app = new Hono()

  // GET /status — minimal liveness + readiness check
  app.get("/status", (c) => {
    const db_check = db_ping()
    const healthy = db_check.ok

    const body: Record<string, unknown> = {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: db_check.ok ? "ok" : "error",
      },
    }

    if (!db_check.ok) {
      body.errors = { database: db_check.error }
    }

    return c.json(body, healthy ? 200 : 503)
  })

  // GET /health — detailed health with system and app metrics
  app.get("/health", (c) => {
    const db_check = db_ping()
    const snap = registry.snapshot()
    const mem = process.memoryUsage()

    const body = {
      status: db_check.ok ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime_seconds: (Date.now() - snap.started_at) / 1000,
      system: {
        memory: {
          rss_bytes: mem.rss,
          heap_used_bytes: mem.heapUsed,
          heap_total_bytes: mem.heapTotal,
          external_bytes: mem.external,
        },
      },
      app: {
        database: {
          status: db_check.ok ? "ok" : "error",
          ...(db_check.error !== undefined && { error: db_check.error }),
        },
        requests: {
          total: snap.http_requests.total,
          errors: snap.http_requests.errors,
          by_status: snap.http_requests.by_status,
          by_method: snap.http_requests.by_method,
        },
        latency_ms: {
          avg: snap.http_latency.avg_ms,
          total_count: snap.http_latency.count,
        },
      },
    }

    return c.json(body, db_check.ok ? 200 : 503)
  })

  // GET /metrics — Prometheus text exposition format 0.0.4
  // Compatible with all Prometheus versions without content negotiation.
  // Ref: https://prometheus.io/docs/instrumenting/exposition_formats/
  app.get("/metrics", (c) => {
    return c.text(render_prometheus(), 200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    })
  })

  return app
}

//  --

export const monitoring_routes = create_monitoring_routes()
