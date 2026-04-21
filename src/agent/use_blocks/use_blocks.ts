import { logger } from "../../shared/logger"
import type {
  cancel_booking_input_type,
  check_availability_input_type,
  create_booking_input_type,
  get_booking_input_type,
  list_bookings_input_type,
  reschedule_booking_input_type,
  retrieve_business_id_input_type,
  tool_use_block_request_type,
  tool_use_block_result_type,
} from "../types"
import {
  handle_cancel_booking,
  handle_check_availability,
  handle_create_booking,
  handle_get_booking,
  handle_list_bookings,
  handle_reschedule_booking,
  handle_retrieve_business_id,
} from "./tool_handlers/tool_handlers"

const dispatch_tool = (
  current_time_ms: number,
  business_id: string,
  user_id: string,
  tool_use_block_request: tool_use_block_request_type,
): tool_use_block_result_type => {
  const { id, input } = tool_use_block_request
  switch (id) {
    case "check_availability":
      return handle_check_availability(business_id, input as check_availability_input_type)
    case "create_booking":
      return handle_create_booking(
        current_time_ms,
        business_id,
        user_id,
        input as create_booking_input_type,
      )
    case "list_bookings":
      return handle_list_bookings(user_id, input as list_bookings_input_type)
    case "get_booking":
      return handle_get_booking(user_id, input as get_booking_input_type)
    case "cancel_booking":
      return handle_cancel_booking(user_id, input as cancel_booking_input_type)
    case "reschedule_booking":
      return handle_reschedule_booking(user_id, input as reschedule_booking_input_type)
    case "retrieve_business_id":
      return handle_retrieve_business_id(input as retrieve_business_id_input_type)
    default:
      return { status: "error", error: `Unknown tool: ${id}` }
  }
}

//  --

export const use_blocks = (
  current_time_ms: number,
  business_id: string,
  user_id: string,
  use_blocks_requests: tool_use_block_request_type[],
): tool_use_block_result_type[] => {
  if (use_blocks_requests.length === 0) {
    logger.error("stop_reason=tool_use but no tool_use blocks found", { user_id })
    throw new Error("Something went wrong, please try again.")
  }

  let current_business_id = business_id
  const tool_results: tool_use_block_result_type[] = []
  for (const tool_use_block of use_blocks_requests) {
    const tool_result = dispatch_tool(current_time_ms, current_business_id, user_id, tool_use_block)
    tool_results.push(tool_result)

    if (
      tool_use_block.id === "retrieve_business_id" &&
      tool_result.status === "success" &&
      "resolved_business_id" in tool_result.data.content
    ) {
      current_business_id = tool_result.data.content.resolved_business_id
    }
  }
  return tool_results
}
