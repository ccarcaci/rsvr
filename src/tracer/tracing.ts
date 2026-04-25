import { AsyncLocalStorage } from "node:async_hooks"
import { logger } from "../shared/logger"

const storage = new AsyncLocalStorage<string>()

const serialize_arg = (arg_value: unknown): unknown => {
  if (arg_value !== null && typeof arg_value === "object") return arg_value
  if (typeof arg_value === "string" && (arg_value.startsWith("{") || arg_value.startsWith("["))) {
    try {
      return JSON.parse(arg_value)
    } catch {
      /* not JSON, fall through */
    }
  }
  return `${arg_value}`
}

//  --

export const enable_trace = (fn: () => Promise<void>): Promise<void> =>
  storage.run(crypto.randomUUID(), fn)

export const trace_id = () => storage.getStore()

export const trace = (module_path: string, method_name: string, ...params: unknown[]) => {
  const trace_id = storage.getStore()
  if (trace_id === undefined) {
    logger.warn("tracing not enabled")
    return
  }
  logger.debug("trace", {
    trace_id,
    module_path,
    method_name,
    method_arguments: params.map(serialize_arg),
  })
}
