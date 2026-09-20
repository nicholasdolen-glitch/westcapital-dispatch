import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { dispatchSchema } from "@/server/validation";
import { listRuns } from "@/server/queries";
import { newId } from "@/lib/id";
import { startRun } from "@/server/engine/runner";
import { emitEvent } from "@/server/engine/events";

export async function GET() {
  return NextResponse.json(await listRuns());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Describe the mission first.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (input.leadAgentId) {
    const lead = await db
      .select({ id: schema.agents.id, name: schema.agents.name, status: schema.agents.status })
      .from(schema.agents)
      .where(eq(schema.agents.id, input.leadAgentId))
      .limit(1);
    if (!lead[0]) return NextResponse.json({ error: "No such lead teammate." }, { status: 400 });
    if (lead[0].status !== "active") {
      return NextResponse.json(
        { error: `${lead[0].name} is paused — resume them before dispatching.` },
        { status: 400 },
      );
    }
  }

  const id = newId("run_");
  await db.insert(schema.runs).values({
    id,
    task: input.task,
    status: "planning",
    tierMode: input.tierMode,
    trigger: "manual",
    triggerRef: null,
    kind: "mission",
    leadAgentId: input.leadAgentId ?? "atlas",
    workflowId: input.workflowId ?? null,
  });
  await emitEvent(id, "run.created", { task: input.task, tierMode: input.tierMode });

  // The engine runs in the background; this response only confirms dispatch.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  startRun(id, input);

  return NextResponse.json({ id }, { status: 201 });
}
