import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { importAgentSchema } from "@/server/validation";
import { newId } from "@/lib/id";
import { HAIR_STYLES, SKINS, HAIR_COLORS, type FaceConfig } from "@/lib/types";

/** Import an exported agent spec. Always a new id, never core. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = importAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That doesn't look like an exported agent spec.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const face: FaceConfig = data.face ?? {
    skin: pick(SKINS),
    hairColor: pick(HAIR_COLORS),
    style: pick(HAIR_STYLES),
  };

  const id = newId("ag_");
  await db.insert(schema.agents).values({
    id,
    name: data.name,
    role: data.role,
    specialty: data.specialty,
    hue: data.hue,
    face: JSON.stringify(face),
    isCore: false,
    spec: JSON.stringify(data.spec),
    status: "active",
  });
  await db.insert(schema.events).values({
    id: newId("ev_"),
    seq: 0,
    type: "agent.added",
    payload: JSON.stringify({ agentId: id, name: data.name, imported: true }),
  });
  return NextResponse.json({ id }, { status: 201 });
}
