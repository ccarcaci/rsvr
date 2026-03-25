import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { Context } from "hono"
import { create_internal_auth_middleware } from "./internal_auth"

describe("internal_auth middleware - localhost access", () => {
  const VALID_API_KEY = "test_secret_key_12345"
  let middleware: (c: Context, next: () => Promise<void>) => Promise<undefined | Response>
  let mock_next: ReturnType<typeof mock>

  beforeEach(() => {
    mock_next = mock(() => Promise.resolve())
    middleware = create_internal_auth_middleware(VALID_API_KEY)
  })

  const create_mock_context = (remote_addr: string, api_key: string | undefined): Context => {
    const mock_response = new Response()
    return {
      req: {
        header: (name: string) => {
          if (name === "x-internal-api-key") return api_key
          return undefined
        },
        path: "/metrics",
        raw: {
          socket: { remoteAddress: remote_addr },
        },
      },
      env: {},
      text: () => mock_response,
    } as unknown as Context
  }

  describe("valid localhost access", () => {
    test("allows_localhost_127_0_0_1_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.1", VALID_API_KEY)

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(mock_next.mock.calls.length).toBe(1)
    })

    test("allows_localhost_ipv6_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("::1", VALID_API_KEY)

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(mock_next.mock.calls.length).toBe(1)
    })

    test("allows_localhost_string_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("localhost", VALID_API_KEY)

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(mock_next.mock.calls.length).toBe(1)
    })

    test("allows_127_prefix_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.99", VALID_API_KEY)

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(mock_next.mock.calls.length).toBe(1)
    })

    test("allows_ipv6_localhost_prefix_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("::ffff:127.0.0.1", VALID_API_KEY)

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(mock_next.mock.calls.length).toBe(1)
    })
  })

  describe("localhost with invalid/missing key", () => {
    test("rejects_localhost_with_missing_api_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.1", undefined)
      let response_status: number | undefined

      context.text = (_: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(401)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("rejects_localhost_with_wrong_api_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.1", "wrong_key_xyz")
      let response_status: number | undefined

      context.text = (_: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(401)
      expect(mock_next.mock.calls.length).toBe(0)
    })
  })
})
