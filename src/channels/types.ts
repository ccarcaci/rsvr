export type channel_type = "whatsapp" | "telegram"

export type incoming_message_type = {
  channel: channel_type
  sender_id: string
  sender_name?: string
  text?: string
  voice_buffer?: Uint8Array<ArrayBuffer>
  voice_mime_type?: string
  raw_payload: unknown
}

export type outgoing_message_type = {
  channel: channel_type
  recipient_id: string
  text: string
}

export type message_handler_type = (message: incoming_message_type) => Promise<string>
