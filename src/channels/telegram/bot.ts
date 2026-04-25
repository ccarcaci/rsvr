import { Bot, type Context } from "grammy"
import { configs } from "../../config/args"
import { handle_message } from "../../reservations/service"
import { logger } from "../../shared/logger"
import { trace } from "../../tracer/tracing"
import type { incoming_message_type } from "../types"
import { download_voice_note } from "./media"
import {
  parse_telegram_text_ctx,
  parse_telegram_voice_ctx,
  type telegram_text_ctx_schema_type,
  type telegram_voice_ctx_schema_type,
} from "./schemas"

const handle_text_message = async (
  ctx: Context,
  validated: telegram_text_ctx_schema_type,
): Promise<void> => {
  trace("src/channels/telegram/bot", "handle_text_message", validated)
  const incoming: incoming_message_type = {
    channel: "telegram",
    sender_id: String(validated.from.id),
    sender_name: validated.from.first_name,
    text: validated.message.text,
    raw_payload: validated.message,
  }

  const reply = await handle_message(Date.now(), incoming)
  await ctx.reply(reply)
}

const handle_voice_message = async (
  ctx: Context,
  validated: telegram_voice_ctx_schema_type,
): Promise<void> => {
  trace("src/channels/telegram/bot", "handle_voice_message", validated)
  const voice = await download_voice_note(validated.message.voice.file_id, ctx.api)

  const incoming: incoming_message_type = {
    channel: "telegram",
    sender_id: String(validated.from.id),
    sender_name: validated.from.first_name,
    voice_buffer: voice.buffer,
    voice_mime_type: voice.mime_type,
    raw_payload: validated.message,
  }

  const reply = await handle_message(Date.now(), incoming)
  await ctx.reply(reply)
}

const try_validate_and_handle_text_message = async (ctx: Context): Promise<void> => {
  trace("src/channels/telegram/bot", "try_validate_and_handle_text_message")
  try {
    const validated = parse_telegram_text_ctx(ctx)
    await handle_text_message(ctx, validated)
  } catch (err) {
    logger.error("Error processing Telegram text message", { error: err })
    await ctx.reply("Sorry, something went wrong. Please try again.")
  }
}

const try_validate_and_handle_voice_message = async (ctx: Context): Promise<void> => {
  trace("src/channels/telegram/bot", "try_validate_and_handle_voice_message")
  try {
    const validated = parse_telegram_voice_ctx(ctx)
    await handle_voice_message(ctx, validated)
  } catch (err) {
    logger.error("Error processing Telegram voice message", { error: err })
    await ctx.reply("Sorry, I couldn't process your voice message. Please try again.")
  }
}

const create_telegram_bot = (token: string): Bot => {
  const bot = new Bot(token)

  bot.on("message:text", try_validate_and_handle_text_message)

  bot.on("message:voice", try_validate_and_handle_voice_message)

  bot.catch((err) => {
    logger.error("Telegram bot error", { error: err })
  })

  return bot
}

//  --

export const telegram_bot = create_telegram_bot(configs.telegram_bot_token)
