import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolDefinition } from "@/server/connectors/types";

/**
 * The single place model calls happen, so swapping providers later touches one file.
 * Requires ANTHROPIC_API_KEY in the environment.
 */
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) {
    // User-level API keys aren't scoped to a workspace; the API then requires
    // the anthropic-workspace-id header on every request.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
    });
  }
  return client;
}

export function toAnthropicTool(def: ToolDefinition): Anthropic.Tool {
  return {
    name: def.name,
    description: def.description,
    input_schema: zodToJsonSchema(def.inputSchema, { target: "jsonSchema7" }) as Anthropic.Tool["input_schema"],
  };
}

export interface CompleteOpts {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: ToolDefinition[];
  maxTokens: number;
}

export async function complete(opts: CompleteOpts): Promise<Anthropic.Message> {
  return getClient().messages.create({
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools.map(toAnthropicTool) } : {}),
  });
}

/** Streaming variant of complete(), for chat-style token-by-token replies. */
export function streamComplete(opts: CompleteOpts) {
  return getClient().messages.stream({
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools.map(toAnthropicTool) } : {}),
  });
}

/** Concatenate all text blocks of a message. */
export function messageText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Pull tool_use blocks out of a message. */
export function toolUses(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}
