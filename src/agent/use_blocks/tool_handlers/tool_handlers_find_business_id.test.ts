import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { mock_module, mock_restore } from "../../../mock_module"
import type { tool_handlers_find_business_id_result_type } from "../../types"
import { mock_db_module } from "./mock"

const BUSINESS_1 = {
  id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
  name: "The Golden Fork Restaurant",
}

const BUSINESS_2 = {
  id: "A023BCC5-B2A4-41C5-AB32-CF145D536D61",
  name: "The Golden Leaf Cafe",
}

describe("tool_handlers", () => {
  let tool_handlers: typeof import("./tool_handlers")

  beforeAll(async () => {
    mock_module("./db/queries", () => mock_db_module)
    tool_handlers = await import("./tool_handlers")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  afterAll(() => {
    mock_restore()
  })

  test("returns_business_id_when_exactly_one_business_matches", () => {
    //  --  arrange
    mock_db_module.find_businesses_by_name.mockReturnValue([BUSINESS_1])

    //  --  act
    const result = tool_handlers.handle_find_business_id({
      business_name: "The Golden Fork Restaurant",
    })

    //  --  assert
    expect(result.status).toBe("success")
    if (result.status === "success") {
      const content = result.data.content as tool_handlers_find_business_id_result_type
      expect(content.resolved_business_id).toBe("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C")
    }
    expect(mock_db_module.find_businesses_by_name).toBeCalledWith("The Golden Fork Restaurant")
  })

  test("returns_error_when_no_business_found", () => {
    //  --  arrange
    mock_db_module.find_businesses_by_name.mockReturnValue([])

    //  --  act
    const result = tool_handlers.handle_find_business_id({
      business_name: "Nonexistent Restaurant",
    })

    //  --  assert
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toContain("No business found")
      expect(result.error).toContain("Nonexistent Restaurant")
    }
    expect(mock_db_module.find_businesses_by_name).toBeCalledWith("Nonexistent Restaurant")
  })

  test("returns_error_with_names_when_multiple_businesses_match", () => {
    //  --  arrange
    mock_db_module.find_businesses_by_name.mockReturnValue([BUSINESS_1, BUSINESS_2])

    //  --  act
    const result = tool_handlers.handle_find_business_id({
      business_name: "The Golden",
    })

    //  --  assert
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toContain("Multiple businesses match")
      expect(result.error).toContain("The Golden Fork Restaurant")
      expect(result.error).toContain("The Golden Leaf Cafe")
    }
    expect(mock_db_module.find_businesses_by_name).toBeCalledWith("The Golden")
  })

  test("returns_error_when_query_throws", () => {
    //  --  arrange
    mock_db_module.find_businesses_by_name.mockImplementation(() => {
      throw new Error("Database connection failed")
    })

    //  --  act
    const result = tool_handlers.handle_find_business_id({
      business_name: "Any Restaurant",
    })

    //  --  assert
    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toContain("Failed to find business id")
    }
  })
})
