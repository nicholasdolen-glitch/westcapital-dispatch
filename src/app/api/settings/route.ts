import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/server/engine/settings";
import { settingsSchema } from "@/server/validation";

/**
 * Ops settings. Today the only key is `kill_switch` (boolean) — the global
 * halt for every agent tool execution. Used by the dashboard and by tests.
 */
export async function GET() {
  return NextResponse.json({ kill_switch: (await getSetting("kill_switch")) === true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Only the kill_switch setting can be changed here.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  await setSetting(parsed.data.key, parsed.data.value);
  return NextResponse.json({ key: parsed.data.key, value: parsed.data.value });
}
