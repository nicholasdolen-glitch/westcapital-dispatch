import { NextResponse } from "next/server";
import { listPendingActions } from "@/server/queries";
import { actionStatusSchema } from "@/server/validation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  let status: string | undefined;
  if (statusParam) {
    const parsed = actionStatusSchema.safeParse(statusParam);
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad status filter." }, { status: 400 });
    }
    status = parsed.data;
  }
  const actions = await listPendingActions(status);
  return NextResponse.json(
    actions.map((a) => ({
      id: a.action.id,
      runId: a.action.runId,
      nodeId: a.action.nodeId,
      agentId: a.action.agentId,
      agentName: a.agentName,
      runTask: a.runTask,
      nodeName: a.nodeName,
      kind: a.action.kind,
      title: a.action.title,
      payload: JSON.parse(a.action.payload),
      status: a.action.status,
      decidedBy: a.action.decidedBy,
      decidedAt: a.action.decidedAt,
      createdAt: a.action.createdAt,
    })),
  );
}
