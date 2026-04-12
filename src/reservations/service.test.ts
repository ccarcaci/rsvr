import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import type { incoming_message_type } from "../channels/types"
import { mock_module, mock_restore } from "../mock_module"
import { mock_db_module, mock_transcribe_module } from "./mock"

mock_module("./voice/transcribe", () => mock_transcribe_module)
mock_module("./db/queries", () => mock_db_module)

import { handle_message } from "./service"

describe("handle_message", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("voice_message_run_agent", async () => {
    //  --  arrange
    const voice_message: incoming_message_type = {
      voice_buffer: new TextEncoder().encode("book an appointment for tomorrow"),
      voice_mime_type: "audio/ogg",
      sender_id: "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      channel: "whatsapp",
      sender_name: "John Doe",
      raw_payload: "",
    }
    const mock_transcribe_audio = mock_transcribe_module.transcribe_audio
    mock_transcribe_audio.mockResolvedValue("book an appointment for tomorrow")

    const mock_create_user = mock_db_module.create_user
    mock_create_user.mockReturnValue({
      id: "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      phone: "+3912345",
      telegram_id: null,
      name: "John Doe",
      channel: "whatsapp",
      created_at: "yesterday",
    })

    //  --  act
    const result = await handle_message(42, voice_message)

    //  --  assert
    expect(typeof result).toBe("string")
    expect(mock_transcribe_audio).toBeCalledWith(voice_message.voice_buffer, "audio/ogg")
    expect(mock_create_user).toBeCalledWith(
      "whatsapp",
      "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      "John Doe",
    )
  })
})
