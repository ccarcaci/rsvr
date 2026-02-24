import { Hono } from "hono"
import { create_telegram_bot } from "./channels/telegram/bot"
import { whatsapp_routes } from "./channels/whatsapp/webhook"
import { configs } from "./config/env"
import { handle_message } from "./reservations/service"
import { logger } from "./shared/logger"

const app = new Hono()

app.get("/", (c) => c.json({ status: "ok", service: "rsvr" }))
app.route("/", whatsapp_routes)

const telegram_bot = create_telegram_bot(configs.telegram_bot_token, handle_message)

telegram_bot.start()
logger.info("Telegram bot started")

logger.info(`rsvr server starting on port ${configs.port}`)
export default {
  port: configs.port,
  fetch: app.fetch,
}
