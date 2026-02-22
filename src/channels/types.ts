export type channel = "whatsapp" | "telegram"

export interface incoming_message {
  channel: channel
  sender_id: string
  sender_name?: string
  text?: string
  voice_buffer?: Buffer
  voice_mime_type?: string
  raw_payload: unknown
}

export interface outgoing_message {
  channel: channel
  recipient_id: string
  text: string
}

export type message_handler = (message: incoming_message) => Promise<string>
