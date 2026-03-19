import { parseArgs } from "node:util"
import { logger } from "../shared/logger"

export type log_level_type = "debug" | "info" | "warn" | "error"

export type config_type = {
  port: number
  telegram_bot_token: string
  whatsapp_verify_token: string
  whatsapp_app_secret: string
  whatsapp_access_token: string
  whatsapp_phone_number_id: string
  anthropic_api_key: string
  openai_api_key: string
  internal_api_key: string
  database_path: string
  graph_api_base: string
  debug: boolean
  log_level: log_level_type
}

type raw_args_type = Record<string, string | boolean | undefined>

const parse_cli_args = (): raw_args_type => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: { type: "string" },
      telegram_bot_token: { type: "string" },
      whatsapp_verify_token: { type: "string" },
      whatsapp_app_secret: { type: "string" },
      whatsapp_access_token: { type: "string" },
      whatsapp_phone_number_id: { type: "string" },
      anthropic_api_key: { type: "string" },
      openai_api_key: { type: "string" },
      internal_api_key: { type: "string" },
      database_path: { type: "string" },
      graph_api_base: { type: "string" },
      debug: { type: "boolean" },
      log_level: { type: "string" },
    },
    strict: false,
  })
  return values as raw_args_type
}

const load_configs = (): config_type => {
  const cli_args = parse_cli_args()
  const missing: string[] = []

  const required = (key: string): string => {
    const value = cli_args[key]
    if (!value) {
      missing.push(`--${key}`)
      return ""
    }
    if (typeof value !== "string") {
      return ""
    }
    return value
  }

  const optional = (key: string, default_value: string): string => {
    const value = cli_args[key]
    if (typeof value === "string") {
      return value
    }
    return default_value
  }

  const cfg: config_type = {
    port: parseInt(required("port"), 10),
    telegram_bot_token: required("telegram_bot_token"),
    whatsapp_verify_token: required("whatsapp_verify_token"),
    whatsapp_app_secret: required("whatsapp_app_secret"),
    whatsapp_access_token: required("whatsapp_access_token"),
    whatsapp_phone_number_id: required("whatsapp_phone_number_id"),
    anthropic_api_key: required("anthropic_api_key"),
    openai_api_key: required("openai_api_key"),
    internal_api_key: required("internal_api_key"),
    database_path: required("database_path"),
    graph_api_base: optional("graph_api_base", "https://graph.facebook.com/v23.0"),
    debug: cli_args.debug === true,
    log_level: (["debug", "info", "warn", "error"].includes(optional("log_level", "info"))
      ? optional("log_level", "info")
      : "info") as log_level_type,
  }

  if (missing.length > 0) {
    throw new Error(`Missing required CLI args: ${missing.join(", ")}`)
  }

  return cfg
}

//  --

const SENSITIVE_PATTERNS = ["secret", "token", "key", "password", "api"]

const is_sensitive = (field_name: string): boolean =>
  SENSITIVE_PATTERNS.some((pattern) => field_name.toLowerCase().includes(pattern))

export const log_config_startup = (config: config_type): void => {
  const masked = Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, is_sensitive(k) ? "[REDACTED]" : v]),
  )
  logger.debug("startup config", masked)
}

export const configs = load_configs()
