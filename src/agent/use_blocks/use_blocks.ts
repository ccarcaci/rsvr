import { logger } from "../../shared/logger"
import { trace } from "../../tracer/tracing"
import type {
  cancel_reservation_input_type,
  check_availability_input_type,
  create_reservation_input_type,
  find_business_id_input_type,
  find_reservation_input_type,
  list_reservations_input_type,
  reschedule_reservation_input_type,
  tool_use_block_request_type,
  tool_use_block_result_type,
} from "../types"
import {
  handle_cancel_reservation,
  handle_check_availability,
  handle_create_reservation,
  handle_find_business_id,
  handle_find_reservation,
  handle_list_reservations,
  handle_reschedule_reservation,
} from "./tool_handlers/tool_handlers"

const dispatch_tool = (
  current_time_ms: number,
  tool_use_block_request: tool_use_block_request_type,
): tool_use_block_result_type => {
  trace("src/agent/use_blocks/use_blocks", "dispatch_tool", current_time_ms, tool_use_block_request)
  const { id, name, input } = tool_use_block_request
  switch (name) {
    case "check_availability":
      return handle_check_availability(input as check_availability_input_type)
    case "create_reservation":
      return handle_create_reservation(current_time_ms, input as create_reservation_input_type)
    case "list_reservations":
      return handle_list_reservations(input as list_reservations_input_type)
    case "find_reservation":
      return handle_find_reservation(input as find_reservation_input_type)
    case "cancel_reservation":
      return handle_cancel_reservation(input as cancel_reservation_input_type)
    case "reschedule_reservation":
      return handle_reschedule_reservation(input as reschedule_reservation_input_type)
    case "find_business_id":
      return handle_find_business_id(input as find_business_id_input_type)
    default:
      return { id, status: "error", error: `Unknown tool: ${name}` }
  }
}

//  --

export const use_blocks = (
  current_time_ms: number,
  use_blocks_requests: tool_use_block_request_type[],
): tool_use_block_result_type[] => {
  trace("src/agent/use_blocks/use_blocks", "use_blocks", current_time_ms, use_blocks_requests)
  if (use_blocks_requests.length === 0) {
    logger.error("stop_reason=tool_use but no tool_use blocks found")
    throw new Error("Something went wrong, please try again.")
  }

  let tool_use_block_results: tool_use_block_result_type[] = []
  for (const tool_use_block of use_blocks_requests) {
    const tool_result = dispatch_tool(current_time_ms, tool_use_block)
    tool_use_block_results = [...tool_use_block_results, tool_result]
  }
  return tool_use_block_results
}
