import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";

/**
 * Event emission with per-run monotonic `seq`, the backbone of SSE resume
 * (?fromSeq=). Inserts are serialized through a promise chain so concurrent
 * node executions can't collide on the sequence number.
 */
let chain: Promise<void> = Promise.resolve();

export async function emitEvent(
  runId: string | null,
  type: string,
  payload: Record<string, unknown>,
  nodeId?: string,
): Promise<void> {
  const work = chain.then(async () => {
    const rows = await db
      .select({ m: sql<number | null>`max(${schema.events.seq})` })
      .from(schema.events)
      .where(runId ? eq(schema.events.runId, runId) : sql`1 = 0`);
    const seq = (rows[0]?.m ?? -1) + 1;
    await db.insert(schema.events).values({
      id: newId("ev_"),
      seq,
      runId,
      nodeId: nodeId ?? null,
      type,
      payload: JSON.stringify(payload),
    });
  });
  chain = work.catch(() => {});
  await work;
}
