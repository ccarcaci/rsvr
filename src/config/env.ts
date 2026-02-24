import { parseArgs } from "node:util"

export interface config {
  port: number
  telegram_bot_token: string
  whatsapp_verify_token: string
  whatsapp_access_token: string
  whatsapp_phone_number_id: string
  anthropic_api_key: string
  openai_api_key: string
  database_path: string
}

const parse_cli_args = (): Record<string, string> => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      telegram_bot_token: { type: "string" },
      whatsapp_verify_token: { type: "string" },
      whatsapp_access_token: { type: "string" },
      whatsapp_phone_number_id: { type: "string" },
      anthropic_api_key: { type: "string" },
      openai_api_key: { type: "string" },
    },
    strict: false,
  })
  return values as Record<string, string>
}

const load_configs = (): config => {
  const cli_args = parse_cli_args()
  const missing: string[] = []

  const required = (cli_key: string, env_key: string): string => {
    const value = cli_args[cli_key] || process.env[env_key]
    if (!value) {
      missing.push(env_key)
      return ""
    }
    return value
  }

  const cfg: config = {
    port: Number(process.env.PORT) || 3000,
    telegram_bot_token: required("telegram_bot_token", "TELEGRAM_BOT_TOKEN"),
    whatsapp_verify_token: required("whatsapp_verify_token", "WHATSAPP_VERIFY_TOKEN"),
    whatsapp_access_token: required("whatsapp_access_token", "WHATSAPP_ACCESS_TOKEN"),
    whatsapp_phone_number_id: required("whatsapp_phone_number_id", "WHATSAPP_PHONE_NUMBER_ID"),
    anthropic_api_key: required("anthropic_api_key", "ANTHROPIC_API_KEY"),
    openai_api_key: required("openai_api_key", "OPENAI_API_KEY"),
    database_path: process.env.DATABASE_PATH || "./data/rsvr.db",
  }

  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(", ")}`)
  }

  return cfg
}

//  --

export const configs = load_configs()
