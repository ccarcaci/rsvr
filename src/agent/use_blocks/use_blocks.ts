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
  business_id: string,
  user_id: string,
  tool_use_block_request: tool_use_block_request_type,
): tool_use_block_result_type => {
  trace(
    "src/agent/use_blocks/use_blocks",
    "dispatch_tool",
    current_time_ms,
    business_id,
    user_id,
    tool_use_block_request,
  )
  const { name, input } = tool_use_block_request
  switch (name) {
    case "check_availability":
      return handle_check_availability(business_id, input as check_availability_input_type)
    case "create_reservation":
      return handle_create_reservation(
        current_time_ms,
        business_id,
        user_id,
        input as create_reservation_input_type,
      )
    case "list_reservations":
      return handle_list_reservations(user_id, input as list_reservations_input_type)
    case "find_reservation":
      return handle_find_reservation(user_id, input as find_reservation_input_type)
    case "cancel_reservation":
      return handle_cancel_reservation(user_id, input as cancel_reservation_input_type)
    case "reschedule_reservation":
      return handle_reschedule_reservation(user_id, input as reschedule_reservation_input_type)
    case "find_business_id":
      return handle_find_business_id(input as find_business_id_input_type)
    default:
      return { status: "error", error: `Unknown tool: ${name}` }
  }
}

//  --

export const use_blocks = (
  current_time_ms: number,
  business_id: string,
  user_id: string,
  use_blocks_requests: tool_use_block_request_type[],
): tool_use_block_result_type[] => {
  trace(
    "src/agent/use_blocks/use_blocks",
    "use_blocks",
    current_time_ms,
    business_id,
    user_id,
    use_blocks_requests,
  )
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
      tool_use_block.name === "find_business_id" &&
      tool_result.status === "success" &&
      "resolved_business_id" in tool_result.data.content
    ) {
      current_business_id = tool_result.data.content.resolved_business_id
    }
  }
  return tool_results
}
