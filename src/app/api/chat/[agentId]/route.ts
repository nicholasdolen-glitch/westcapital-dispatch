import { NextResponse } from "next/server";
import { chatMessageSchema } from "@/server/validation";
import {
  getChatMessages,
  loadChatAgent,
  saveChatMessage,
  streamChatReply,
} from "@/server/chat";

export const dynamic = "force-dynamic";

/** Conversation history with a teammate. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;
  const agent = await loadChatAgent(agentId);
  if (!agent) return NextResponse.json({ error: "No such teammate." }, { status: 404 });
  return NextResponse.json({ messages: await getChatMessages(agentId) });
}

/**
 * Send a message to a teammate. Streams the reply as SSE:
 *   event: delta  data: {"text": "..."}
 *   event: done   data: {"message": {...}}
 *   event: error  data: {"error": "..."}
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await ctx.params;
  const agent = await loadChatAgent(agentId);
  if (!agent) return NextResponse.json({ error: "No such teammate." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Say something first." }, { status: 400 });
  }

  await saveChatMessage(agentId, "user", parsed.data.content);

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };
      let full = "";
      try {
        full = await streamChatReply(agent, (delta) => {
          send("delta", JSON.stringify({ text: delta }));
        });
      } catch (err) {
        send(
          "error",
          JSON.stringify({ error: err instanceof Error ? err.message : "Reply failed." }),
        );
      }
      // Persist the reply even if the client disconnected mid-stream.
      if (full.trim()) {
        const saved = await saveChatMessage(agentId, "assistant", full);
        send("done", JSON.stringify({ message: saved }));
      } else if (!closed) {
        send("error", JSON.stringify({ error: "The teammate went quiet — try again." }));
      }
      if (!closed) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
