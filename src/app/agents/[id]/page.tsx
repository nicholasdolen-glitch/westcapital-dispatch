import { notFound } from "next/navigation";
import { Emblem } from "@/components/avatar/Emblem";
import { getAgent, agentStats, agentSubNodes } from "@/server/queries";
import { LEAD_ID } from "@/lib/types";
import { RemoveAgentButton } from "@/components/agents/RemoveAgentButton";

export const dynamic = "force-dynamic";

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) notFound();

  const [statsMap, subs] = await Promise.all([agentStats(), agentSubNodes(id)]);
  const s = statsMap.get(id);
  const total = (s?.done ?? 0) + (s?.failed ?? 0);
  const rate = total ? `${Math.round(((s?.done ?? 0) / total) * 100)}%` : "–";
  const avg = s?.done ? `${(s.totalMs / s.done / 1000).toFixed(1)}s` : "–";

  return (
    <section>
      <div className="detail-hero">
        <div className="detail-emblem">
          <Emblem hue={agent.hue} face={agent.face} uid={`detail-${agent.id}`} />
        </div>
        <div className="detail-info">
          <h2>{agent.name}</h2>
          <div className="rl">
            {agent.role} — {agent.specialty}
          </div>
          <div className="detail-stats">
            <span className="stat">
              <span className="v">{total}</span>
              <br />
              <span className="k">Tasks</span>
            </span>
            <span className="stat">
              <span className="v">{rate}</span>
              <br />
              <span className="k">Success</span>
            </span>
            <span className="stat">
              <span className="v">{avg}</span>
              <br />
              <span className="k">Avg time</span>
            </span>
            <span className="stat">
              <span className="v">{s?.activeNow ?? 0}</span>
              <br />
              <span className="k">Active now</span>
            </span>
          </div>
        </div>
        {!agent.isCore && <RemoveAgentButton id={agent.id} name={agent.name} />}
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Agent spec</h3>
        <div className="appr-meta" style={{ marginBottom: 8 }}>
          model {agent.spec.model.model} · autonomy {agent.spec.autonomy} · max steps{" "}
          {agent.spec.maxSteps} · status {agent.status}
          {agent.spec.connectors.length > 0
            ? ` · connectors: ${agent.spec.connectors
                .map((c) => `${c.platform} (${c.permissions})`)
                .join(", ")}`
            : " · no connectors"}
          {agent.spec.triggers.length > 0
            ? ` · triggers: ${agent.spec.triggers.map((t) => t.type).join(", ")}`
            : ""}
        </div>
        <div className="qa-btns" style={{ flexDirection: "row" }}>
          <a href={`/api/agents/${agent.id}/export`}>Export spec JSON</a>
        </div>
      </div>

      <div className="view-head">
        <h2 style={{ fontSize: 17 }}>Subagents and their tasks</h2>
        {subs.length > 0 && (
          <span className="sub">Everything {agent.name} has spawned, newest first.</span>
        )}
      </div>
      {subs.length === 0 ? (
        <div className="subagent-empty">
          No subagents yet. Dispatch a mission from the command center
          {agent.id !== LEAD_ID ? `, or send ${agent.name} a task directly` : ""}.
        </div>
      ) : (
        <div>
          {subs.map(({ node, task }) => (
            <div key={node.id} style={{ margin: "10px 0" }}>
              <div className={`card ${node.status === "queued" ? "" : node.status === "stopped" ? "failed" : node.status}`}>
                <div className="card-top">
                  <span className="dot" aria-hidden="true" />
                  <span className="node-name">{node.name}</span>
                  <span className="node-role">
                    {node.role} · mission: {task.slice(0, 70)}
                    {task.length > 70 ? "…" : ""}
                  </span>
                  <span className="status">{node.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
