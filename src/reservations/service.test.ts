import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import type { incoming_message_type } from "../channels/types"
import { mock_module, mock_restore } from "../mock_module"
import { mock_agent_module, mock_db_module, mock_transcribe_module } from "./mock"

describe("handle_message", () => {
  let service: typeof import("./service")

  beforeAll(async () => {
    mock_module("./voice/transcribe", () => mock_transcribe_module)
    mock_module("./db/queries", () => mock_db_module)
    mock_module("./agent/agent", () => mock_agent_module)
    service = await import("./service")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("voice_message_run_agent", async () => {
    //  --  arrange
    const voice_message: incoming_message_type = {
      voice_buffer: new TextEncoder().encode("reserve an appointment for tomorrow"),
      voice_mime_type: "audio/ogg",
      sender_id: "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      channel: "whatsapp",
      sender_name: "John Doe",
      raw_payload: "",
    }
    mock_transcribe_module.transcribe_audio.mockResolvedValue("reserve an appointment for tomorrow")

    mock_db_module.create_user.mockReturnValue({
      id: "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      phone: "+3912345",
      telegram_id: null,
      name: "John Doe",
      channel: "whatsapp",
      created_at: "yesterday",
    })

    mock_agent_module.run_agent.mockResolvedValue("The answer is 42")

    //  --  act
    const result = await service.handle_message(42, voice_message)

    //  --  assert
    expect(result).toBe("The answer is 42")
    expect(mock_transcribe_module.transcribe_audio).toBeCalledWith(
      voice_message.voice_buffer,
      "audio/ogg",
    )
    expect(mock_db_module.create_user).toBeCalledWith(
      "whatsapp",
      "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      "John Doe",
    )
    expect(mock_agent_module.run_agent).toBeCalledWith(
      42,
      "E6BE41DB-8A68-47A9-9465-25CCA471A105",
      "whatsapp:E6BE41DB-8A68-47A9-9465-25CCA471A105",
      "reserve an appointment for tomorrow",
    )
  })
})
