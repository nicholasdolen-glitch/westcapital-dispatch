import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun, getRunNodes, listPendingActions } from "@/server/queries";
import { RunStream } from "@/components/runs/RunStream";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["done", "failed", "stopped"]);

export default async function RunDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();

  const [nodes, allActions] = await Promise.all([
    getRunNodes(id),
    listPendingActions(),
  ]);
  const actions = allActions.filter((a) => a.action.runId === id);

  return (
    <section>
      <div className="view-head">
        <h2>Mission</h2>
        <span className="sub">
          {run.kind} · triggered {run.trigger} · {run.tierMode}
        </span>
        <span className="spacer" />
        <span className="status">{run.status}</span>
      </div>
      <p style={{ marginBottom: 14 }}>{run.task}</p>

      <RunStream runId={id} initialTerminal={TERMINAL.has(run.status)} />

      {actions.length > 0 && (
        <>
          <div className="view-head">
            <h2 style={{ fontSize: 16 }}>Pending actions</h2>
          </div>
          <div style={{ marginBottom: 14 }}>
            {actions.map((a) => (
              <Link key={a.action.id} href="/approvals" className="run-row">
                <span className="status">{a.action.status}</span>
                <span className="run-task">
                  {a.action.title} — {a.agentName}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="view-head">
        <h2 style={{ fontSize: 16 }}>Nodes</h2>
        <span className="sub">{nodes.length} total</span>
      </div>
      <div>
        {nodes.map((n) => (
          <div key={n.id} style={{ margin: "10px 0" }}>
            <div
              className={`card ${n.status === "queued" ? "" : n.status === "stopped" ? "failed" : n.status}`}
            >
              <div className="card-top">
                <span className="dot" aria-hidden="true" />
                <span className="node-name">{n.name}</span>
                <span className="node-role">
                  {n.kind} · {n.role}
                </span>
                <span className="status">{n.status}</span>
              </div>
              {n.output && <div className="node-out">{n.output.slice(0, 1200)}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
