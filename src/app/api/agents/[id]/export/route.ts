import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseSpec } from "@/lib/agentSpec";

/** Download the agent's full spec as JSON — accepted back by POST /api/agents/import. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  const agent = rows[0];
  if (!agent) return NextResponse.json({ error: "No such teammate." }, { status: 404 });

  const payload = {
    name: agent.name,
    role: agent.role,
    specialty: agent.specialty,
    hue: agent.hue,
    face: JSON.parse(agent.face),
    spec: parseSpec(agent.spec, agent.name, agent.role, agent.specialty),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="agent-${agent.id}-spec.json"`,
    },
  });
}
