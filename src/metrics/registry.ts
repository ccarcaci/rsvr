// In-memory metrics registry. All counters and histograms are module-level
// singletons so any module that imports this shares the same state.

// Histogram boundaries in milliseconds for request latency
const LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]

export type histogram_bucket_type = {
  le: number
  count: number
}

type latency_histogram_type = {
  buckets: histogram_bucket_type[]
  sum: number
  count: number
}

const make_histogram = (): latency_histogram_type => ({
  buckets: LATENCY_BUCKETS.map((le) => ({ le, count: 0 })),
  sum: 0,
  count: 0,
})

const observe_latency = (histogram: latency_histogram_type, value_ms: number): void => {
  histogram.sum += value_ms
  histogram.count += 1
  for (const bucket of histogram.buckets) {
    if (value_ms <= bucket.le) {
      bucket.count += 1
    }
  }
}

// ---- counters ----

type request_counters_type = {
  total: number
  by_status: Map<number, number>
  by_method: Map<string, number>
  by_path: Map<string, number>
  errors: number
}

const make_request_counters = (): request_counters_type => ({
  total: 0,
  by_status: new Map(),
  by_method: new Map(),
  by_path: new Map(),
  errors: 0,
})

// ---- registry state ----

const started_at = Date.now()

const http_requests = make_request_counters()
const http_latency = make_histogram()

// ---- public API ----

export const registry = {
  record_request: (method: string, path: string, status: number, duration_ms: number): void => {
    http_requests.total += 1

    if (status >= 500) {
      http_requests.errors += 1
    }

    const prev_status = http_requests.by_status.get(status) ?? 0
    http_requests.by_status.set(status, prev_status + 1)

    const prev_method = http_requests.by_method.get(method) ?? 0
    http_requests.by_method.set(method, prev_method + 1)

    const prev_path = http_requests.by_path.get(path) ?? 0
    http_requests.by_path.set(path, prev_path + 1)

    observe_latency(http_latency, duration_ms)
  },

  snapshot: () => ({
    started_at,
    http_requests: {
      total: http_requests.total,
      errors: http_requests.errors,
      by_status: Object.fromEntries(http_requests.by_status),
      by_method: Object.fromEntries(http_requests.by_method),
      by_path: Object.fromEntries(http_requests.by_path),
    },
    http_latency: {
      buckets: http_latency.buckets.map((b) => ({ le: b.le, count: b.count })),
      sum_ms: http_latency.sum,
      count: http_latency.count,
      avg_ms: http_latency.count > 0 ? http_latency.sum / http_latency.count : 0,
    },
  }),
}
