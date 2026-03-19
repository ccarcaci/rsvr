import OpenAI from "openai"

let cached_client: OpenAI | null = null

export const init_openai_client = (api_key: string): void => {
  cached_client = new OpenAI({ apiKey: api_key })
}

export const get_openai_client = (): OpenAI => {
  if (!cached_client) {
    throw new Error("OpenAI client not initialized. Call init_openai_client() first.")
  }
  return cached_client
}
