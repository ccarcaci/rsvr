import OpenAI from "openai"
import { configs } from "../../config/env"

export const openai_client = new OpenAI({ apiKey: configs.openai_api_key })
