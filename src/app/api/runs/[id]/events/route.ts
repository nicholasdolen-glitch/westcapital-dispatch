import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { getRun } from "@/server/queries";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of a run's events.
 * Accepts ?fromSeq= to resume (replays missed events first, then streams live).
 * Closes once the run reaches a terminal status and the queue is drained.
 */
const TERMINAL = new Set(["done", "failed", "stopped"]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return new Response("No such run.", { status: 404 });

  const url = new URL(req.url);
  let lastSeq = Number(url.searchParams.get("fromSeq") ?? "-1");
  if (!Number.isFinite(lastSeq)) lastSeq = -1;

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, seq: number, payload: string) => {
        controller.enqueue(encoder.encode(`id: ${seq}\nevent: ${type}\ndata: ${payload}\n\n`));
      };
      try {
        while (!closed) {
          const rows = await db
            .select()
            .from(schema.events)
            .where(and(eq(schema.events.runId, id), gt(schema.events.seq, lastSeq)))
            .orderBy(schema.events.seq)
            .limit(200);
          for (const r of rows) {
            send(r.type, r.seq, r.payload);
            lastSeq = r.seq;
          }
          const current = await getRun(id);
          if (current && TERMINAL.has(current.status) && rows.length === 0) {
            send("run.terminal", lastSeq, JSON.stringify({ status: current.status }));
            break;
          }
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch {
        /* client went away */
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
