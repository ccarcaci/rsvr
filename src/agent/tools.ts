import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages"

export const AGENT_TOOLS: Tool[] = [
  {
    name: "check_availability",
    description:
      "Check whether a time slot is available for a given date, time, and party size. " +
      "Always call this before create_reservation. Returns the slot details if available, or an error if not.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date for the reservation in YYYY-MM-DD format.",
        },
        time: {
          type: "string",
          description: "The time for the reservation in HH:MM (24-hour) format.",
        },
        party_size: {
          type: "number",
          description: "Number of people. Defaults to 1 if not provided.",
        },
      },
      required: ["date", "time"],
    },
  },
  {
    name: "find_business_id",
    description:
      "Identify the business to reserve the appointment to. Ask for the name of the activity to uniquely identify it in the database. Do not guess",
    input_schema: {
      type: "object",
      properties: {
        business_name: {
          type: "string",
          description: "The name of the business.",
        },
      },
      required: ["business_name"],
    },
  },
  {
    name: "create_reservation",
    description:
      "Create a reservation for a specific slot. You MUST call check_availability first and use the " +
      "slot_id returned from that call. Do not guess slot IDs.",
    input_schema: {
      type: "object",
      properties: {
        slot_id: {
          type: "string",
          description: "The time_slot id returned by check_availability.",
        },
        party_size: {
          type: "number",
          description: "Number of people. Defaults to 1.",
        },
        notes: {
          type: "string",
          description: "Optional notes or special requests for the reservation.",
        },
      },
      required: ["slot_id"],
    },
  },
  {
    name: "list_reservations",
    description: "List all active (confirmed) reservations for the current user.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "find_reservation",
    description: "Find details for a specific reservation by its ID.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID to look up.",
        },
      },
      required: ["reservation_id"],
    },
  },
  {
    name: "cancel_reservation",
    description: "Cancel an existing confirmed reservation by its ID.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID to cancel.",
        },
      },
      required: ["reservation_id"],
    },
  },
  {
    name: "reschedule_reservation",
    description:
      "Reschedule an existing confirmed reservation to a new date and time. " +
      "Availability for the new slot will be verified before rescheduling.",
    input_schema: {
      type: "object",
      properties: {
        reservation_id: {
          type: "string",
          description: "The reservation ID to reschedule.",
        },
        new_date: {
          type: "string",
          description: "The new date in YYYY-MM-DD format.",
        },
        new_time: {
          type: "string",
          description: "The new time in HH:MM (24-hour) format.",
        },
      },
      required: ["reservation_id", "new_date", "new_time"],
    },
  },
]
