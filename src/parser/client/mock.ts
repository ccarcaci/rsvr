import { mock } from "bun:test"

export const mock_anthropic_client = (response_text: string) => {
  mock.module("./anthropic", () => ({
    client: {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: response_text }],
        }),
      },
    },
  }))
}

mock_anthropic_client("")
