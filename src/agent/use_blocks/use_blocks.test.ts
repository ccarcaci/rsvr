import { afterAll, afterEach, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../mock_module"
import type {
  tool_handlers_result_type,
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
  id: string,
  tool_use_name: string,
  content?: tool_handlers_result_type,
): tool_use_block_result_type => ({
  id,
  status: "success",
  data: { tool_use_name, content: content ?? ({} as tool_handlers_result_type) },
})

describe("use_blocks", () => {
  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("throws_when_use_blocks_requests_is_empty", () => {
    expect(() => use_blocks(CURRENT_TIME_MS, [])).toThrow(
      "Something went wrong, please try again.",
    )
  })

  test("dispatches_check_availability_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0001-0000-0000-000000000001"
    const input = { business_id: BUSINESS_ID, date: "2026-04-15", time: "19:00", party_size: 2 }
    const result = success(id, "check_availability")
    mock_tool_handlers_module.handle_check_availability.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "check_availability", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_check_availability).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_create_reservation_with_current_time_ms_and_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0002-0000-0000-000000000002"
    const input = { business_id: BUSINESS_ID, user_id: USER_ID, slot_id: "SLOT-42", party_size: 2 }
    const result = success(id, "create_reservation")
    mock_tool_handlers_module.handle_create_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "create_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_create_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_create_reservation).toBeCalledWith(CURRENT_TIME_MS, input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_list_reservations_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0003-0000-0000-000000000003"
    const input = { user_id: USER_ID }
    const result = success(id, "list_reservations")
    mock_tool_handlers_module.handle_list_reservations.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "list_reservations", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_list_reservations).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_list_reservations).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_find_reservation_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0004-0000-0000-000000000004"
    const input = { user_id: USER_ID, reservation_id: "RES-001" }
    const result: tool_use_block_result_type = {
      id,
      status: "error",
      error: "find_reservation is not yet implemented.",
    }
    mock_tool_handlers_module.handle_find_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "find_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_find_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_find_reservation).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_cancel_reservation_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0005-0000-0000-000000000005"
    const input = { user_id: USER_ID, reservation_id: "RES-001" }
    const result = success(id, "cancel_reservation")
    mock_tool_handlers_module.handle_cancel_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "cancel_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_cancel_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_cancel_reservation).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_reschedule_reservation_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0006-0000-0000-000000000006"
    const input = { user_id: USER_ID, reservation_id: "RES-001", new_date: "2026-04-20", new_time: "20:00" }
    const result: tool_use_block_result_type = {
      id,
      status: "error",
      error: "reschedule_reservation is not yet implemented.",
    }
    mock_tool_handlers_module.handle_reschedule_reservation.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "reschedule_reservation", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_reschedule_reservation).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_reschedule_reservation).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("dispatches_find_business_id_with_input", () => {
    //  --  arrange
    const id = "A1B2C3D4-0007-0000-0000-000000000007"
    const input = { business_name: "Acme" }
    const result = success(id, "find_business_id")
    mock_tool_handlers_module.handle_find_business_id.mockReturnValue(result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "find_business_id", input },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(mock_tool_handlers_module.handle_find_business_id).toBeCalledTimes(1)
    expect(mock_tool_handlers_module.handle_find_business_id).toBeCalledWith(input)
    expect(block_results).toEqual([result])
  })

  test("returns_all_results_for_multiple_tool_calls", () => {
    //  --  arrange
    const list_id = "A1B2C3D4-0008-0000-0000-000000000008"
    const cancel_id = "A1B2C3D4-0009-0000-0000-000000000009"
    const list_result = success(list_id, "list_reservations")
    const cancel_result = success(cancel_id, "cancel_reservation")
    mock_tool_handlers_module.handle_list_reservations.mockReturnValue(list_result)
    mock_tool_handlers_module.handle_cancel_reservation.mockReturnValue(cancel_result)

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id: list_id, name: "list_reservations", input: { user_id: USER_ID } },
      { id: cancel_id, name: "cancel_reservation", input: { user_id: USER_ID, reservation_id: "RES-001" } },
    ] as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([list_result, cancel_result])
  })

  test("returns_error_for_unknown_tool_id", () => {
    //  --  arrange
    const id = "A1B2C3D4-0010-0000-0000-000000000010"

    //  --  act
    const block_results = use_blocks(CURRENT_TIME_MS, [
      { id, name: "unknown_tool", input: {} },
    ] as unknown as tool_use_block_request_type[])

    //  --  assert
    expect(block_results).toEqual([{ id, status: "error", error: "Unknown tool: unknown_tool" }])
  })
})
