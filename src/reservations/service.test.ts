import { afterEach, describe, expect, mock, test } from "bun:test"
import type { incoming_message_type } from "../channels/types"
import { mock_db_module, mock_transcribe_module } from "./mock"

// Mock only direct dependencies of service, not the agent module (which has its own tests)
mock.module("../voice/transcribe", () => mock_transcribe_module)
mock.module("../db/queries", () => mock_db_module)

const service = await import("./service")

describe("handle_message", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  test("voice_message_run_agent", async () => {
    //  --  arrange
    const voice_message: incoming_message_type = {
      voice_buffer: new TextEncoder().encode("book an appointment for tomorrow"),
      voice_mime_type: "audio/ogg",
      sender_id: "e6be41db-8a68-47a9-9465-25cca471a105",
      channel: "whatsapp",
      sender_name: "John Doe",
      raw_payload: "",
    }
    const mock_transcribe_audio = mock_transcribe_module.transcribe_audio
    mock_transcribe_audio.mockResolvedValue("book an appointment for tomorrow")

    const mock_create_user = mock_db_module.create_user
    mock_create_user.mockReturnValue({
      id: 42,
      phone: "+3912345",
      telegram_id: null,
      name: "John Doe",
      channel: "whatsapp",
      created_at: "yesterday",
    })

    //  --  act
    const result = await service.handle_message(voice_message, 42)

    //  --  assert
    expect(typeof result).toBe("string")
    expect(mock_transcribe_audio).toBeCalledWith(voice_message.voice_buffer, "audio/ogg")
    expect(mock_create_user).toBeCalledWith(
      "whatsapp",
      "e6be41db-8a68-47a9-9465-25cca471a105",
      "John Doe",
    )
  })
})
