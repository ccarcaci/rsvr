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
  tool_use_name: string,
  content?: tool_handler_content_type,
): tool_use_block_result_type => ({
  status: "success",
  data: { tool_use_name, content: content ?? ({} as tool_handler_content_type) },
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
      { name: "check_availability", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(BUSINESS_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_create_reservation_with_time_business_id_user_id_and_input", () => {
    //  --  arrange
    const input = { slot_id: "SLOT-42", party_size: 2 }
    const result = success("create_reservation")
    mock_tool_handlers_module.handle_create_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "create_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_create_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_create_reservation).toBeCalledWith(
      CURRENT_TIME_MS,
      BUSINESS_ID,
      USER_ID,
      input,
    )
    expect(block_results).toEqual([result])
  })

  test("dispatches_list_reservations_with_user_id_and_input", () => {
    //  --  arrange
    const input = {}
    const result = success("list_reservations")
    mock_tool_handlers_module.handle_list_reservations.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "list_reservations", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_list_reservations).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_list_reservations).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_find_reservation_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001" }
    const result: tool_use_block_result_type = {
      status: "error",
      error: "find_reservation is not yet implemented.",
    }
    mock_tool_handlers_module.handle_find_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "find_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_find_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_find_reservation).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_cancel_reservation_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001" }
    const result = success("cancel_reservation")
    mock_tool_handlers_module.handle_cancel_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "cancel_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_cancel_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_cancel_reservation).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_reschedule_reservation_with_user_id_and_input", () => {
    //  --  arrange
    const input = { reservation_id: "RES-001", new_date: "2026-04-20", new_time: "20:00" }
    const result: tool_use_block_result_type = {
      status: "error",
      error: "reschedule_reservation is not yet implemented.",
    }
    mock_tool_handlers_module.handle_reschedule_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "reschedule_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_reschedule_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_reschedule_reservation).toBeCalledWith(USER_ID, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_find_business_id_with_input", () => {
    //  --  arrange
    const input = { business_name: "Acme" }
    const result = success("find_business_id")
    mock_tool_handlers_module.handle_find_business_id.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "find_business_id", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_find_business_id).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_find_business_id).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("propagates_resolved_business_id_to_subsequent_tool_calls", () => {
    //  --  arrange
    const new_business_id = "B2C3D4E5-0000-0000-0000-000000000001"
    const find_result = success("find_business_id", {
      resolved_business_id: new_business_id,
    })
    const check_result = success("check_availability")
    mock_tool_handlers_module.handle_find_business_id.mockReturnValue(find_result)
    mock_tool_handlers_module.handle_check_availability.mockReturnValue(check_result)
    const check_input = { date: "2026-04-15", time: "19:00" }

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "find_business_id", input: { business_name: "Acme" } },
      { name: "check_availability", input: check_input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(
      new_business_id,
      check_input,
    )
    expect(block_results).toEqual([find_result, check_result])
  })

  test("returns_all_results_for_multiple_tool_calls", () => {
    //  --  arrange
    const list_result = success("list_reservations")
    const cancel_result = success("cancel_reservation")
    mock_tool_handlers_module.handle_list_reservations.mockReturnValue(list_result)
    mock_tool_handlers_module.handle_cancel_reservation.mockReturnValue(cancel_result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "list_reservations", input: {} },
      { name: "cancel_reservation", input: { reservation_id: "RES-001" } },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([list_result, cancel_result])
  })

  test("returns_error_for_unknown_tool_id", () => {
    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, BUSINESS_ID, USER_ID, [
      { name: "unknown_tool", input: {} },
    ] as unknown as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([{ status: "error", error: "Unknown tool: unknown_tool" }])
  })
})
