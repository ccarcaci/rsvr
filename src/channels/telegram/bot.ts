import { Bot } from "grammy"
import { configs } from "../../config/args"
import { handle_message } from "../../reservations/service"
import { logger } from "../../shared/logger"
import type { incoming_message_type } from "../types"
import { download_voice_note } from "./media"

// biome-ignore lint/suspicious/noExplicitAny: grammy Context type is too complex to express
const try_handle_text_message = async (ctx: any): Promise<void> => {
  try {
    const incoming: incoming_message_type = {
      channel: "telegram",
      sender_id: String(ctx.from.id),
      sender_name: ctx.from.first_name,
      text: ctx.message.text,
      raw_payload: ctx.message,
    }

    const reply = await handle_message(incoming, Date.now())
    await ctx.reply(reply)
  } catch (err) {
    logger.error("Error processing Telegram text message", { error: err })
    await ctx.reply("Sorry, something went wrong. Please try again.")
  }
}

// biome-ignore lint/suspicious/noExplicitAny: grammy Context type is too complex to express
const try_handle_voice_message = async (ctx: any): Promise<void> => {
  try {
    const voice = await download_voice_note(ctx.message.voice.file_id, ctx.api)

    const incoming: incoming_message_type = {
      channel: "telegram",
      sender_id: String(ctx.from.id),
      sender_name: ctx.from.first_name,
      voice_buffer: voice.buffer,
      voice_mime_type: voice.mime_type,
      raw_payload: ctx.message,
    }

    const reply = await handle_message(incoming, Date.now())
    await ctx.reply(reply)
  } catch (err) {
    logger.error("Error processing Telegram voice message", { error: err })
    await ctx.reply("Sorry, I couldn't process your voice message. Please try again.")
  }
}

const create_telegram_bot = (token: string): Bot => {
  const bot = new Bot(token)

  bot.on("message:text", try_handle_text_message)

  bot.on("message:voice", try_handle_voice_message)

  bot.catch((err) => {
    logger.error("Telegram bot error", { error: err })
  })

  return bot
}

//  --

export const telegram_bot = create_telegram_bot(configs.telegram_bot_token)
