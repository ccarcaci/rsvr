import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import type {
  DirectCaller,
  Message,
  MessageParam,
  StopReason,
  TextBlock,
  ToolUseBlock,
  Usage,
} from "@anthropic-ai/sdk/resources"
import { mock_module, mock_restore } from "../../mock_module"
import type { session_entry_type } from "../types"
import { mock_anthropic_module, mock_session_module } from "./mock"

const SENDER_KEY = "0A67E73B-4D82-415F-B574-740D5455E8D0"

const mock_anthropic_message = (
  stop_reason: string,
  text?: string,
  blocks: Pick<ToolUseBlock, "id" | "name" | "input">[] = [],
): Message => ({
  id: "CF645DF3-B8AA-41E0-AF99-91852B70616C",
  container: null,
  model: "claude-opus-4-6",
  role: "assistant",
  stop_details: null,
  stop_reason: stop_reason as StopReason,
  stop_sequence: null,
  type: "message",
  usage: {} as Usage,
  content: [
    ...(text !== undefined
      ? [
          {
            citations: null,
            text,
            type: "text",
          } as TextBlock,
        ]
      : []),
    ...blocks.map(
      (block) =>
        ({
          id: block.id,
          name: block.name,
          caller: {} as DirectCaller,
          input: block.input,
          type: "tool_use",
        }) as ToolUseBlock,
    ),
  ],
})

const mock_anthropic_prompt = (text: string): MessageParam => ({
  role: "user",
  content: text,
})

describe("ai_client", () => {
  let ai_client: typeof import("./ai_client")

  beforeAll(async () => {
    mock_module("./agent/ai_client/anthropic/anthropic", () => mock_anthropic_module)
    mock_module("./agent/ai_client/session/session", () => mock_session_module)
    ai_client = await import("./ai_client")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("forwards_current_time_ms_and_history_to_message_conversation", async () => {
    //  --  arrange
    const existing_session: session_entry_type = {
      last_active: 0,
      history: [
        {
          role: "assistant",
          content: [
            {
              id: "BF23DFBB-61FD-4603-9ABC-B8E2FF00F13C",
              type: "tool_use",
              name: "check_availability",
              input: {},
            },
          ],
        },
      ],
    }
    mock_session_module.find_session.mockReturnValue(existing_session)

    const api_response = mock_anthropic_message("end_turn", "Hello world", [
      {
        id: "7A0CAB80-703A-4249-8C88-E5F38CB219D7",
        name: "find_business_id",
        input: { business_name: "bar_at_the_end_of_universe" },
      },
    ])
    mock_anthropic_module.message_conversation.mockResolvedValue(api_response)

    //  --  act
    const prompt_input = "I need a table at the end of universe"
    const result = await ai_client.prompt(42, SENDER_KEY, prompt_input)

    //  --  assert
    expect(mock_session_module.add_message_to_session).nthCalledWith(
      1,
      42,
      SENDER_KEY,
      mock_anthropic_prompt(prompt_input),
    )
    expect(mock_session_module.find_session).toBeCalledWith(42, SENDER_KEY)
    expect(mock_anthropic_module.message_conversation).toBeCalledTimes(1)
    expect(mock_anthropic_module.message_conversation).toBeCalledWith(42, existing_session.history)
    expect(mock_session_module.add_message_to_session).nthCalledWith(
      2,
      42,
      SENDER_KEY,
      api_response,
    )
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Hello world",
      use_blocks: [
        {
          id: "7A0CAB80-703A-4249-8C88-E5F38CB219D7",
          name: "find_business_id",
          input: { business_name: "bar_at_the_end_of_universe" },
        },
      ],
    })
  })

  test("deserializes_text_block_and_tool_use_blocks", async () => {
    //  --  arrange
    mock_session_module.find_session.mockReturnValue({ history: [], last_active: 0 })

    const api_response = mock_anthropic_message("end_turn", "Hello world", [
      {
        id: "589A6D23-B466-4077-ACD7-2E48B709C021",
        name: "check_availability",
        input: {
          business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
          date: "2026-04-15",
          time: "19:00",
        },
      },
    ])
    mock_anthropic_module.message_conversation.mockResolvedValue(api_response)

    //  --  act
    const result = await ai_client.prompt(42, SENDER_KEY, "prompt input")

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Hello world",
      use_blocks: [
        {
          id: "589A6D23-B466-4077-ACD7-2E48B709C021",
          name: "check_availability",
          input: {
            business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
            date: "2026-04-15",
            time: "19:00",
          },
        },
      ],
    })
  })

  test("returns_empty_use_blocks_when_response_has_text_only", async () => {
    //  --  arrange
    mock_session_module.find_session.mockReturnValue({ history: [], last_active: 0 })

    const api_response = mock_anthropic_message("end_turn", "Just a text response", [])
    mock_anthropic_module.message_conversation.mockResolvedValue(api_response)

    //  --  act
    const result = await ai_client.prompt(42, SENDER_KEY, "prompt input")

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Just a text response",
      use_blocks: [],
    })
  })

  test("returns_empty_text_block_when_response_has_tool_use_only", async () => {
    //  --  arrange
    mock_session_module.find_session.mockReturnValue({ history: [], last_active: 0 })

    const api_response = mock_anthropic_message("end_turn", undefined, [
      {
        id: "7A3F9B2E-1C48-4D6F-A850-3E7C92D14B05",
        name: "check_availability",
        input: {
          business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
          date: "2026-04-15",
          time: "19:00",
        },
      },
    ])
    mock_anthropic_module.message_conversation.mockResolvedValue(api_response)

    //  --  act
    const result = await ai_client.prompt(42, SENDER_KEY, "prompt input")

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "",
      use_blocks: [
        {
          id: "7A3F9B2E-1C48-4D6F-A850-3E7C92D14B05",
          name: "check_availability",
          input: {
            business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
            date: "2026-04-15",
            time: "19:00",
          },
        },
      ],
    })
  })

  test("deserializes_multiple_tool_use_blocks", async () => {
    //  --  arrange
    mock_session_module.find_session.mockReturnValue({ history: [], last_active: 0 })

    const api_response = mock_anthropic_message("end_turn", "Processing your request", [
      {
        id: "2B8D4E6A-F130-4C7D-9E52-A1B3C8D7E6F5",
        name: "check_availability",
        input: {
          business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
          date: "2026-04-15",
          time: "19:00",
        },
      },
      {
        id: "3C9E5F7B-2D41-4A8E-B063-F2C4D9E8F7A6",
        name: "create_reservation",
        input: {
          business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
          user_id: "7C8D9E0F-1A2B-3C4D-5E6F-7A8B9C0D1E2F",
          slot_id: "SLOT-42",
          party_size: 2,
        },
      },
      {
        id: "4D0F6A8C-3E52-4B9F-C174-A3D5E0F9A8B7",
        name: "list_reservations",
        input: { user_id: "7C8D9E0F-1A2B-3C4D-5E6F-7A8B9C0D1E2F" },
      },
    ])

    mock_anthropic_module.message_conversation.mockResolvedValue(api_response)

    //  --  act
    const result = await ai_client.prompt(42, SENDER_KEY, "prompt input")

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Processing your request",
      use_blocks: [
        {
          id: "2B8D4E6A-F130-4C7D-9E52-A1B3C8D7E6F5",
          name: "check_availability",
          input: {
            business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
            date: "2026-04-15",
            time: "19:00",
          },
        },
        {
          id: "3C9E5F7B-2D41-4A8E-B063-F2C4D9E8F7A6",
          name: "create_reservation",
          input: {
            business_id: "3F2A1B4C-9D7E-4F8A-B5C6-1D2E3F4A5B6C",
            user_id: "7C8D9E0F-1A2B-3C4D-5E6F-7A8B9C0D1E2F",
            slot_id: "SLOT-42",
            party_size: 2,
          },
        },
        {
          id: "4D0F6A8C-3E52-4B9F-C174-A3D5E0F9A8B7",
          name: "list_reservations",
          input: { user_id: "7C8D9E0F-1A2B-3C4D-5E6F-7A8B9C0D1E2F" },
        },
      ],
    })
  })
})
