import { Hono } from "hono"
import { create_telegram_bot } from "./channels/telegram/bot"
import { create_whatsapp_client } from "./channels/whatsapp/client"
import { create_whatsapp_routes } from "./channels/whatsapp/webhook"
import { load_config } from "./config/env"
import { init_database } from "./db/client"
import { init_intent_parser } from "./parser/intent"
import { handle_message } from "./reservations/service"
import { logger } from "./shared/logger"
import { init_transcriber } from "./voice/transcribe"

const config = load_config()

init_database(config.database_path)
init_transcriber(config.openai_api_key)
init_intent_parser(config.anthropic_api_key)

const app = new Hono()

app.get("/", (c) => c.json({ status: "ok", service: "rsvr" }))

const whatsapp_client = create_whatsapp_client(config)
const whatsapp_routes = create_whatsapp_routes(config, whatsapp_client, handle_message)
app.route("/", whatsapp_routes)

const telegram_bot = create_telegram_bot(config.telegram_bot_token, handle_message)

telegram_bot.start()
logger.info("Telegram bot started")

logger.info(`rsvr server starting on port ${config.port}`)
export default {
  port: config.port,
  fetch: app.fetch,
}
