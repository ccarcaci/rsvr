import { Hono } from "hono"
import { telegram_bot } from "./channels/telegram/bot"
import { whatsapp_routes } from "./channels/whatsapp/webhook"
import { configs } from "./config/env"
import { logger } from "./shared/logger"

const app = new Hono()

app.get("/", (c) => c.json({ status: "ok", service: "rsvr" }))
app.route("/", whatsapp_routes)
logger.info("Whatsapp routes registered")

telegram_bot.start()
logger.info("Telegram bot started")

logger.info(`rsvr server starting on port ${configs.port}`)
export default {
  port: configs.port,
  fetch: app.fetch,
}
