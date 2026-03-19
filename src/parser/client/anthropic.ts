import Anthropic from "@anthropic-ai/sdk"

let cached_client: Anthropic | null = null

export const init_anthropic_client = (api_key: string): void => {
  cached_client = new Anthropic({ apiKey: api_key })
}

export const get_anthropic_client = (): Anthropic => {
  if (!cached_client) {
    throw new Error("Anthropic client not initialized. Call init_anthropic_client() first.")
  }
  return cached_client
}
