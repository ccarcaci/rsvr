import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"

import { mock_db_module } from "./mock"

const CLIENT_1 = {
  id: "48740B1B-0AA2-48DD-9EEE-C14B6AC3258C",
  name: "The Golden Fork Restaurant",
}

const CLIENT_2 = {
  id: "A023BCC5-B2A4-41C5-AB32-CF145D536D61",
  name: "The Golden Leaf Cafe",
}

describe("tool_handlers", () => {
  let handlers: typeof import("./tool_handlers")

  beforeAll(async () => {
    // Register mocks within describe block to prevent cross-test contamination.
    // When mocks are at module level, they persist globally and affect other test files
    // that import the same modules, causing them to receive mocked versions instead of real implementations.
    mock.module("../db/queries", () => mock_db_module)
    handlers = await import("./tool_handlers")
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  describe("handle_retrieve_client_id", () => {
    beforeEach(() => {
      mock_db_module.find_clients_by_name.mockReturnValue([])
    })

    test("returns_client_id_when_exactly_one_client_matches", () => {
      //  --  arrange
      mock_db_module.find_clients_by_name.mockReturnValue([CLIENT_1])

      //  --  act
      const result = handlers.handle_retrieve_client_id({
        client_name: "The Golden Fork Restaurant",
      })

      //  --  assert
      expect(result.status).toBe("success")
      if (result.status === "success") {
        const data = result.data as { client_id: string }
        expect(data.client_id).toBe("48740B1B-0AA2-48DD-9EEE-C14B6AC3258C")
      }
      expect(mock_db_module.find_clients_by_name).toBeCalledWith("The Golden Fork Restaurant")
    })

    test("returns_error_when_no_client_found", () => {
      //  --  arrange
      mock_db_module.find_clients_by_name.mockReturnValue([])

      //  --  act
      const result = handlers.handle_retrieve_client_id({
        client_name: "Nonexistent Restaurant",
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("No client found")
        expect(result.error).toContain("Nonexistent Restaurant")
      }
      expect(mock_db_module.find_clients_by_name).toBeCalledWith("Nonexistent Restaurant")
    })

    test("returns_error_with_names_when_multiple_clients_match", () => {
      //  --  arrange
      mock_db_module.find_clients_by_name.mockReturnValue([CLIENT_1, CLIENT_2])

      //  --  act
      const result = handlers.handle_retrieve_client_id({
        client_name: "The Golden",
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Multiple clients match")
        expect(result.error).toContain("The Golden Fork Restaurant")
        expect(result.error).toContain("The Golden Leaf Cafe")
      }
      expect(mock_db_module.find_clients_by_name).toBeCalledWith("The Golden")
    })

    test("returns_error_when_query_throws", () => {
      //  --  arrange
      mock_db_module.find_clients_by_name.mockImplementation(() => {
        throw new Error("Database connection failed")
      })

      //  --  act
      const result = handlers.handle_retrieve_client_id({
        client_name: "Any Restaurant",
      })

      //  --  assert
      expect(result.status).toBe("error")
      if (result.status === "error") {
        expect(result.error).toContain("Failed to retrieve client id")
      }
    })
  })
})
