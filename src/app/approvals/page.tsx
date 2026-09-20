import { ApprovalCards, type ApprovalItem } from "@/components/approvals/ApprovalCards";
import { listPendingActions } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const rows = await listPendingActions("pending");
  const items: ApprovalItem[] = rows.map((r) => ({
    id: r.action.id,
    runId: r.action.runId,
    nodeId: r.action.nodeId,
    agentId: r.action.agentId,
    agentName: r.agentName,
    runTask: r.runTask,
    nodeName: r.nodeName,
    kind: r.action.kind,
    title: r.action.title,
    payload: JSON.parse(r.action.payload),
    status: r.action.status,
    createdAt: r.action.createdAt.toISOString(),
  }));

  return (
    <section>
      <div className="view-head">
        <h2>Approvals</h2>
        <span className="sub">
          {items.length > 0
            ? `${items.length} action${items.length === 1 ? "" : "s"} waiting on you`
            : "Your agents check with you before doing anything side-effecting."}
        </span>
      </div>
      <ApprovalCards items={items} />
    </section>
  );
}
