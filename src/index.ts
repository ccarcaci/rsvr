import { Hono } from "hono"
import { telegram_bot } from "./channels/telegram/bot"
import { whatsapp_routes } from "./channels/whatsapp/webhook"
import { configs } from "./config/args"
import { metrics_middleware } from "./metrics/middleware"
import { monitoring_routes } from "./metrics/routes"
import { logger } from "./shared/logger"

const app = new Hono()

app.use("*", metrics_middleware)

//  --

app.get("/", (c) => c.json({ status: "ok", service: "rsvr" }))
app.route("/", whatsapp_routes)
logger.info("Whatsapp routes registered")

//  --

app.route("/", monitoring_routes)
logger.info("Monitoring routes registered (/status, /health, /metrics)")

//  --

logger.info("Booting Telegram bot")
telegram_bot.start().catch((err) => {
  logger.warn("Telegram bot cannot start, check token validity", { err: err })
})

//  --

logger.info(`rsvr server starting on port ${configs.port}`)
export default {
  port: configs.port,
  fetch: app.fetch,
}
