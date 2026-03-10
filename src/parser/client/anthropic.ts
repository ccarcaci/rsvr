import Anthropic from "@anthropic-ai/sdk"
import { configs } from "../../config/args"

export const client = new Anthropic({ apiKey: configs.anthropic_api_key })
