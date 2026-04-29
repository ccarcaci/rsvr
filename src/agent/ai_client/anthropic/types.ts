import { Messages } from "@anthropic-ai/sdk/resources";

export type anthropic_api_message_type = Awaited<ReturnType<typeof Messages.prototype.create.prototype>> | Parameters<typeof Messages.prototype.create.prototype>[0]
