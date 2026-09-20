import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { createAgentSchema } from "@/server/validation";
import { listAgents } from "@/server/queries";
import { newId } from "@/lib/id";
import { defaultSpec } from "@/lib/agentSpec";
import { HAIR_STYLES, SKINS, HAIR_COLORS, type FaceConfig } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listAgents());
}

function randomFace(): FaceConfig {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  return {
    skin: pick(SKINS),
    hairColor: pick(HAIR_COLORS),
    style: pick(HAIR_STYLES),
    glasses: Math.random() < 0.3,
    earring: Math.random() < 0.25,
    beard: Math.random() < 0.2,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the teammate's name, role, and specialty.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, role, specialty, hue } = parsed.data;
  const face = parsed.data.face ?? randomFace();
  const id = newId("ag_");
  const spec = parsed.data.spec ?? defaultSpec(name, role, specialty);

  await db.insert(schema.agents).values({
    id,
    name,
    role,
    specialty,
    hue,
    face: JSON.stringify(face),
    isCore: false,
    spec: JSON.stringify(spec),
    status: parsed.data.status ?? "active",
  });
  await db.insert(schema.events).values({
    id: newId("ev_"),
    seq: 0,
    type: "agent.added",
    payload: JSON.stringify({ agentId: id, name }),
  });

  return NextResponse.json({ id }, { status: 201 });
}
