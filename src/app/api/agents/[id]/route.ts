import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";
import { updateAgentSchema } from "@/server/validation";
import { emitEvent } from "@/server/engine/events";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Couldn't apply that update.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  const agent = rows[0];
  if (!agent) return NextResponse.json({ error: "No such teammate." }, { status: 404 });

  const data = parsed.data;
  const patch: Partial<typeof schema.agents.$inferInsert> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.role !== undefined) patch.role = data.role;
  if (data.specialty !== undefined) patch.specialty = data.specialty;
  if (data.hue !== undefined) patch.hue = data.hue;
  if (data.face !== undefined) patch.face = JSON.stringify(data.face);
  if (data.spec !== undefined) patch.spec = JSON.stringify(data.spec);
  if (data.status !== undefined) patch.status = data.status;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await db.update(schema.agents).set(patch).where(eq(schema.agents.id, id));
  await emitEvent(null, "agent.updated", { agentId: id, fields: Object.keys(patch) });
  return NextResponse.json({ id, updated: Object.keys(patch) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  const agent = rows[0];
  if (!agent) return NextResponse.json({ error: "No such teammate." }, { status: 404 });
  if (agent.isCore)
    return NextResponse.json({ error: "Core teammates can't be removed." }, { status: 403 });

  try {
    await db.delete(schema.agents).where(eq(schema.agents.id, id));
  } catch {
    // FK: the agent has task history. Keeping records wins over deleting.
    return NextResponse.json(
      { error: `${agent.name} has run history, so they can't be removed yet.` },
      { status: 409 },
    );
  }

  await db.insert(schema.events).values({
    id: newId("ev_"),
    seq: 0,
    type: "agent.removed",
    payload: JSON.stringify({ agentId: id, name: agent.name }),
  });

  return NextResponse.json({ ok: true });
}
