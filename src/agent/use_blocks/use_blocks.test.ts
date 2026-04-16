import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../mock_module"
import type {
  tool_handler_content_type,
  tool_use_block_request_type,
  tool_use_block_result_type,
} from "../types"
import { mock_tool_handlers_module } from "./mock"
import { use_blocks } from "./use_blocks"

mock_module("./agent/use_blocks/tool_handlers/tool_handlers", () => mock_tool_handlers_module)

const BUSINESS_ID = "DD152853-01F0-44CA-9C0D-E0109ADAFAE9"
const USER_ID = "A7E58DB6-16E4-4688-B1ED-5A9437A7739A"
const CURRENT_TIME_MS = 42

const success = (
  tool_use_id: string,
  content?: tool_handler_content_type,
): tool_use_block_result_type => ({
  status: "success",
  data: { tool_use_id, content: content ?? ({} as tool_handler_content_type) },
})

describe("use_blocks", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("throws_when_use_blocks_requests_is_empty", () => {
    expect(() => use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [])).toThrow(
      "Something went wrong, please try again.",
    )
  })

  test("dispatches_check_availability_with_business_id_and_input", () => {
    //  --  arrange
    const input = { date: "2026-04-15", time: "19:00", party_size: 2 }
    const result = success("check_availability")
    mock_tool_handlers_module.handle_check_availability.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "check_availability", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(BUSINESS_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_create_booking_with_time_business_id_user_id_and_input", () => {
    //  --  arrange
    const input = { slot_id: "SLOT-42", party_size: 2 }
    const result = success("create_booking")
    mock_tool_handlers_module.handle_create_booking.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "create_booking", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_create_booking).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_create_booking).toBeCalledWith(
      CURRENT_TIME_MS,
      BUSINESS_ID,
      USER_ID,
      input,
    )
    expect(block_results).toEqual([result])
  })

  test("dispatches_list_bookings_with_user_id_and_input", () => {
    //  --  arrange
    const input = {}
    const result = success("list_bookings")
    mock_tool_handlers_module.handle_list_bookings.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "list_bookings", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_list_bookings).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_list_bookings).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_get_booking_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001" }
    const result: tool_use_block_result_type = {
      status: "error",
      error: "get_booking is not yet implemented.",
    }
    mock_tool_handlers_module.handle_get_booking.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "get_booking", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_get_booking).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_get_booking).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_cancel_booking_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001" }
    const result = success("cancel_booking")
    mock_tool_handlers_module.handle_cancel_booking.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "cancel_booking", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_cancel_booking).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_cancel_booking).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_reschedule_booking_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001", new_date: "2026-04-20", new_time: "20:00" }
    const result: tool_use_block_result_type = {
      status: "error",
      error: "reschedule_booking is not yet implemented.",
    }
    mock_tool_handlers_module.handle_reschedule_booking.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "reschedule_booking", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_reschedule_booking).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_reschedule_booking).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_retrieve_business_id_with_input", () => {
    //  --  arrange
    const input = { business_name: "Acme" }
    const result = success("retrieve_business_id")
    mock_tool_handlers_module.handle_retrieve_business_id.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "retrieve_business_id", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_retrieve_business_id).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_retrieve_business_id).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("propagates_resolved_business_id_to_subsequent_tool_calls", () => {
    //  --  arrange
    const new_business_id = "B2C3D4E5-0000-0000-0000-000000000001"
    const retrieve_result = success("retrieve_business_id", {
      resolved_business_id: new_business_id,
    })
    const check_result = success("check_availability")
    mock_tool_handlers_module.handle_retrieve_business_id.mockReturnValue(retrieve_result)
    mock_tool_handlers_module.handle_check_availability.mockReturnValue(check_result)
    const check_input = { date: "2026-04-15", time: "19:00" }

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "retrieve_business_id", input: { business_name: "Acme" } },
      { id: "check_availability", input: check_input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(
      new_business_id,
      check_input,
    )
    expect(block_results).toEqual([retrieve_result, check_result])
  })

  test("returns_all_results_for_multiple_tool_calls", () => {
    //  --  arrange
    const list_result = success("list_bookings")
    const cancel_result = success("cancel_booking")
    mock_tool_handlers_module.handle_list_bookings.mockReturnValue(list_result)
    mock_tool_handlers_module.handle_cancel_booking.mockReturnValue(cancel_result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "list_bookings", input: {} },
      { id: "cancel_booking", input: { reservation_id: "RES-001" } },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([list_result, cancel_result])
  })

  test("returns_error_for_unknown_tool_id", () => {
    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { id: "unknown_tool", input: {} },
    ] as unknown as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([{ status: "error", error: "Unknown tool: unknown_tool" }])
  })
})
