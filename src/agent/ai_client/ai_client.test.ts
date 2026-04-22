import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { mock_module, mock_restore } from "../../mock_module"
import { mock_anthropic_module } from "./mock"

mock_module("./agent/ai_client/anthropic/anthropic", () => mock_anthropic_module)

import type {
  DirectCaller,
  Message,
  StopReason,
  TextBlock,
  ToolUseBlock,
  Usage,
} from "@anthropic-ai/sdk/resources"
import type { tool_use_block_request_type } from "../types"
import { prompt } from "./ai_client"

const mock_anthropic_message = (
  stop_reason: string,
  text?: string,
  blocks: tool_use_block_request_type[] = [],
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
      (block: tool_use_block_request_type) =>
        ({
          id: block.id,
          caller: {} as DirectCaller,
          input: block.input,
          type: "tool_use",
        }) as ToolUseBlock,
    ),
  ],
})

describe("ai_client", () => {
  afterEach(() => mock_anthropic_module.message_conversation.mockClear())

  afterAll(() => mock_restore)

  test("forwards_current_time_ms_and_history_to_message_conversation", async () => {
    //  --  arrange
    mock_anthropic_module.message_conversation.mockResolvedValue(
      mock_anthropic_message("end_turn", "Hello world", [
        {
          id: "check_availability",
          input: {},
        },
      ]),
    )
    const history = [
      {
        role: "user",
        content: { foo: "bar" },
      },
    ]

    //  --  act
    await prompt(42, history)

    //  --  assert
    expect(mock_anthropic_module.message_conversation).toBeCalledTimes(1)
    expect(mock_anthropic_module.message_conversation).toBeCalledWith(42, history)
  })

  test("deserializes_text_block_and_tool_use_blocks", async () => {
    //  --  arrange
    mock_anthropic_module.message_conversation.mockResolvedValue(
      mock_anthropic_message("end_turn", "Hello world", [
        {
          id: "check_availability",
          input: {},
        },
      ]),
    )

    //  --  act
    const result = await prompt(42, [])

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Hello world",
      use_blocks: [
        {
          id: "check_availability",
          input: {},
        },
      ],
      feedback_content: result.feedback_content, // not relevant since its type is unknown
    })
  })

  test("returns_empty_use_blocks_when_response_has_text_only", async () => {
    //  --  arrange
    mock_anthropic_module.message_conversation.mockResolvedValue(
      mock_anthropic_message("end_turn", "Just a text response", []),
    )

    //  --  act
    const result = await prompt(42, [])

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Just a text response",
      use_blocks: [],
      feedback_content: result.feedback_content, // not relevant since its type is unknown
    })
  })

  test("returns_empty_text_block_when_response_has_tool_use_only", async () => {
    //  --  arrange
    mock_anthropic_module.message_conversation.mockResolvedValue(
      mock_anthropic_message("end_turn", undefined, [
        {
          id: "check_availability",
          input: { date: "2026-04-15", time: "19:00" },
        },
      ]),
    )

    //  --  act
    const result = await prompt(42, [])

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "",
      use_blocks: [
        {
          id: "check_availability",
          input: { date: "2026-04-15", time: "19:00" },
        },
      ],
      feedback_content: result.feedback_content, // not relevant since its type is unknown
    })
  })

  test("deserializes_multiple_tool_use_blocks", async () => {
    //  --  arrange
    mock_anthropic_module.message_conversation.mockResolvedValue(
      mock_anthropic_message("end_turn", "Processing your request", [
        {
          id: "check_availability",
          input: { date: "2026-04-15", time: "19:00" },
        },
        {
          id: "create_reservation",
          input: { slot_id: "SLOT-42", party_size: 2 },
        },
        {
          id: "list_reservations",
          input: {},
        },
      ]),
    )

    //  --  act
    const result = await prompt(42, [])

    //  --  assert
    expect(result).toEqual({
      stop_reason: "end_turn",
      text_block: "Processing your request",
      use_blocks: [
        {
          id: "check_availability",
          input: { date: "2026-04-15", time: "19:00" },
        },
        {
          id: "create_reservation",
          input: { slot_id: "SLOT-42", party_size: 2 },
        },
        {
          id: "list_reservations",
          input: {},
        },
      ],
      feedback_content: result.feedback_content, // not relevant since its type is unknown
    })
  })
})
