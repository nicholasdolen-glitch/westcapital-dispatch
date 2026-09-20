import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { emitEvent } from "./events";

export async function getSetting(key: string): Promise<unknown> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (!rows[0]) return undefined;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return undefined;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value: JSON.stringify(value) })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(value) } });
}

/** True when the global kill switch is on. Checked before EVERY tool execution. */
export async function killSwitchOn(): Promise<boolean> {
  return (await getSetting("kill_switch")) === true;
}

/** Halt a run immediately: status → stopped, nodes left running are marked stopped. */
export async function stopRun(runId: string, reason: string): Promise<void> {
  await db
    .update(schema.runs)
    .set({ status: "stopped", finishedAt: new Date() })
    .where(eq(schema.runs.id, runId));
  await db
    .update(schema.taskNodes)
    .set({ status: "stopped", finishedAt: new Date() })
    .where(
      and(
        eq(schema.taskNodes.runId, runId),
        inArray(schema.taskNodes.status, ["queued", "running", "awaiting_approval"]),
      ),
    );
  await emitEvent(runId, "run.stopped", { reason });

  // Pending approvals on a stopped run can never be decided — expire them so
  // the inbox only shows actions a human can actually take.
  await db
    .update(schema.pendingActions)
    .set({ status: "expired" })
    .where(
      and(eq(schema.pendingActions.runId, runId), eq(schema.pendingActions.status, "pending")),
    );
}
