import { Bot } from "grammy"
import { logger } from "../../shared/logger"
import type { incoming_message, message_handler } from "../types"
import { download_voice_note } from "./media"

export const create_telegram_bot = (token: string, handler: message_handler): Bot => {
  const bot = new Bot(token)

  bot.on("message:text", async (ctx) => {
    const incoming: incoming_message = {
      channel: "telegram",
      sender_id: String(ctx.from.id),
      sender_name: ctx.from.first_name,
      text: ctx.message.text,
      raw_payload: ctx.message,
    }

    try {
      const reply = await handler(incoming)
      await ctx.reply(reply)
    } catch (err) {
      logger.error("Error processing Telegram text message", { error: err })
      await ctx.reply("Sorry, something went wrong. Please try again.")
    }
  })

  bot.on("message:voice", async (ctx) => {
    try {
      const voice = await download_voice_note(ctx.api, ctx.message.voice.file_id)

      const incoming: incoming_message = {
        channel: "telegram",
        sender_id: String(ctx.from.id),
        sender_name: ctx.from.first_name,
        voice_buffer: voice.buffer,
        voice_mime_type: voice.mime_type,
        raw_payload: ctx.message,
      }

      const reply = await handler(incoming)
      await ctx.reply(reply)
    } catch (err) {
      logger.error("Error processing Telegram voice message", { error: err })
      await ctx.reply("Sorry, I couldn't process your voice message. Please try again.")
    }
  })

  bot.catch((err) => {
    logger.error("Telegram bot error", { error: err })
  })

  return bot
}
