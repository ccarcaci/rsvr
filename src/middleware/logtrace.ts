import type { Context, Next } from "hono"
import { enable_trace } from "../tracer/tracing"

export const logtrace = async (_: Context, next: Next): Promise<void> => enable_trace(next)
