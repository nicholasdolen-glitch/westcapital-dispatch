import { asc, eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";
import { parseSpec } from "@/lib/agentSpec";
import { streamComplete } from "@/server/engine/model";

export interface ChatMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
}

const HISTORY_LIMIT = 40;
const REPLY_MAX_TOKENS = 1024;

/** Conversation history for an agent, oldest first. */
export async function getChatMessages(agentId: string): Promise<ChatMessageDTO[]> {
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.agentId, agentId))
    .orderBy(asc(schema.chatMessages.at))
    .limit(HISTORY_LIMIT);
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    at: r.at.toISOString(),
  }));
}

export async function saveChatMessage(
  agentId: string,
  role: "user" | "assistant",
  content: string,
): Promise<ChatMessageDTO> {
  const [row] = await db
    .insert(schema.chatMessages)
    .values({ id: newId("msg_"), agentId, role, content })
    .returning();
  return {
    id: row!.id,
    role: role,
    content: row!.content,
    at: row!.at.toISOString(),
  };
}

export interface ChatAgent {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
}

/** Load the agent row + parsed spec needed to answer as that teammate. */
export async function loadChatAgent(agentId: string): Promise<ChatAgent | null> {
  const rows = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, agentId))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  const spec = parseSpec(row.spec, row.name, row.role, row.specialty);
  return {
    id: row.id,
    name: row.name,
    systemPrompt: spec.systemPrompt,
    model: spec.model.model,
  };
}

function toAnthropicHistory(messages: ChatMessageDTO[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Stream the agent's reply to its conversation history.
 * onDelta receives text chunks; resolves to the full reply text.
 */
export async function streamChatReply(
  agent: ChatAgent,
  onDelta: (text: string) => void | Promise<void>,
): Promise<string> {
  const history = await getChatMessages(agent.id);
  const stream = streamComplete({
    model: agent.model,
    system:
      agent.systemPrompt +
      "\n\nYou are chatting directly with Nick, your manager, in the Dispatch dashboard. " +
      "Be conversational and concise. If he asks you to do work that needs tools or " +
      "side effects, explain what you'd do and suggest dispatching it as a mission.",
    messages: toAnthropicHistory(history),
    maxTokens: REPLY_MAX_TOKENS,
  });
  let full = "";
  stream.on("text", (text) => {
    full += text;
    void onDelta(text);
  });
  // Resolves when the stream ends; rejects on stream errors.
  await stream.finalMessage();
  return full;
}
