import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { Context } from "hono"
import { create_internal_auth_middleware } from "./internal_auth"

describe("internal_auth_middleware_external_access", () => {
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

  describe("non_localhost_access", () => {
    test("rejects_external_ip_even_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("192.168.1.100", VALID_API_KEY)
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(403)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("rejects_public_ip_with_valid_key", async () => {
      //  --  arrange
      const context = create_mock_context("8.8.8.8", VALID_API_KEY)
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(403)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("rejects_non_localhost_with_missing_key", async () => {
      //  --  arrange
      const context = create_mock_context("10.0.0.1", undefined)
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(403)
      expect(mock_next.mock.calls.length).toBe(0)
    })
  })

  describe("edge_cases", () => {
    test("handles_unknown_remote_address", async () => {
      //  --  arrange
      const context = create_mock_context("unknown", VALID_API_KEY)
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(403)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("handles_empty_api_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.1", "")
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(401)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("is_case_sensitive_for_api_key", async () => {
      //  --  arrange
      const context = create_mock_context("127.0.0.1", "TEST_SECRET_KEY_12345")
      let response_status: number | undefined

      context.text = (_message: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      expect(response_status).toBe(401)
      expect(mock_next.mock.calls.length).toBe(0)
    })

    test("does_not_trust_spoofed_x_forwarded_for_header", async () => {
      //  --  arrange
      // Attacker tries to spoof X-Forwarded-For to bypass network check
      const context = create_mock_context("8.8.8.8", VALID_API_KEY)

      // Override header to include spoofed X-Forwarded-For
      context.req.header = (name: string) => {
        if (name === "X-Forwarded-For") return "127.0.0.1"
        if (name === "x-internal-api-key") return VALID_API_KEY
        return undefined
      }

      let response_status: number | undefined

      context.text = (_: string, status: number) => {
        response_status = status
        return new Response()
      }

      //  --  act
      await middleware(context, mock_next)

      //  --  assert
      // Should still reject because direct connection is not localhost
      expect(response_status).toBe(403)
      expect(mock_next.mock.calls.length).toBe(0)
    })
  })
})
