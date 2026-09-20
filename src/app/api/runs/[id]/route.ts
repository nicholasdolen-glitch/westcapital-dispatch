import { NextResponse } from "next/server";
import { getRun, getRunNodes, listPendingActions } from "@/server/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });
  const [nodes, actions] = await Promise.all([
    getRunNodes(id),
    listPendingActions().then((all) => all.filter((a) => a.action.runId === id)),
  ]);
  return NextResponse.json({ run, nodes, actions });
}
