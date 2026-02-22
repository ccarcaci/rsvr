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

export const load_config = (): config => {
  const missing: string[] = []

  const required = (name: string): string => {
    const value = process.env[name]
    if (!value) {
      missing.push(name)
      return ""
    }
    return value
  }

  const config: config = {
    port: Number(process.env.PORT) || 3000,
    telegram_bot_token: required("TELEGRAM_BOT_TOKEN"),
    whatsapp_verify_token: required("WHATSAPP_VERIFY_TOKEN"),
    whatsapp_access_token: required("WHATSAPP_ACCESS_TOKEN"),
    whatsapp_phone_number_id: required("WHATSAPP_PHONE_NUMBER_ID"),
    anthropic_api_key: required("ANTHROPIC_API_KEY"),
    openai_api_key: required("OPENAI_API_KEY"),
    database_path: process.env.DATABASE_PATH || "./data/rsvr.db",
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }

  return config
}
