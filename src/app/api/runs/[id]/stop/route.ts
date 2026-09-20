import { NextResponse } from "next/server";
import { getRun } from "@/server/queries";
import { stopRun } from "@/server/engine/settings";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });
  if (!["planning", "running"].includes(run.status)) {
    return NextResponse.json({ id, status: run.status, stopped: false });
  }
  await stopRun(id, "stopped by human from the dashboard");
  return NextResponse.json({ id, status: "stopped", stopped: true });
}
