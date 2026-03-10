import OpenAI from "openai"
import { configs } from "../../config/args"

export const openai_client = new OpenAI({ apiKey: configs.openai_api_key })
