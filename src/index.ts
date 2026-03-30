import { Hono } from "hono"
import { telegram_bot } from "./channels/telegram/bot"
import { whatsapp_routes } from "./channels/whatsapp/webhook"
import { configs, log_config_startup } from "./config/args"
import { init_db } from "./db/client"
import { metrics_middleware } from "./metrics/middleware"
import { monitoring_routes } from "./metrics/routes"
import { debug_request_logger } from "./middleware/debug_request_logger"
import { request_logger } from "./middleware/request_logger"
import { init_anthropic_client } from "./parser/client/anthropic"
import { logger, set_log_level } from "./shared/logger"
import { init_openai_client } from "./voice/client/openai"

// Initialize services with loaded config
set_log_level(configs.log_level)
init_db(configs.database_path)
init_anthropic_client(configs.anthropic_api_key)
init_openai_client(configs.openai_api_key)

const app = new Hono()

if (configs.debug) {
  logger.debug("debug mode enabled — mounting request logger")
  app.use("*", debug_request_logger)
}

app.use("*", request_logger)
app.use("*", metrics_middleware)

if (!configs.log_status_endpoint) {
  logger.info("status endpoint logging is disabled (use --log_status_endpoint to enable)")
}

//  --

app.get("/", (c) => c.json({ status: "ok", service: "rsvr" }))
app.route("/", whatsapp_routes)
logger.info("Whatsapp routes registered")

//  --

app.route("/", monitoring_routes)
logger.info("Monitoring routes registered (/status, /monitor, /metrics)")

//  --

logger.info("Booting Telegram bot")
telegram_bot.start().catch((err) => {
  logger.warn("Telegram bot cannot start, check token validity", { err: err })
})

//  --

logger.info(`rsvr server starting on port ${configs.port}`)
log_config_startup(configs)
export default {
  port: configs.port,
  fetch: app.fetch,
}
