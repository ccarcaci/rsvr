import Anthropic from "@anthropic-ai/sdk"
import { configs } from "../../config/env"

export const client = new Anthropic({ apiKey: configs.anthropic_api_key })
