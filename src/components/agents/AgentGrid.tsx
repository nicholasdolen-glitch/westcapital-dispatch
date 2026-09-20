import Link from "next/link";
import { Emblem } from "@/components/avatar/Emblem";
import type { AgentDTO, AgentStats } from "@/lib/types";
import { AddAgentButton } from "./AddAgentDialog";

function fmtRate(s: AgentStats | undefined): string {
  const total = (s?.done ?? 0) + (s?.failed ?? 0);
  return total ? `${Math.round(((s?.done ?? 0) / total) * 100)}%` : "–";
}
function fmtAvg(s: AgentStats | undefined): string {
  return s?.done ? `${(s.totalMs / s.done / 1000).toFixed(1)}s` : "–";
}

export function AgentCard({ agent, stats }: { agent: AgentDTO; stats?: AgentStats }) {
  const total = (stats?.done ?? 0) + (stats?.failed ?? 0);
  const running = (stats?.activeNow ?? 0) > 0;
  return (
    <Link href={`/agents/${agent.id}`} className="agent-card">
      <span className="emblem">
        <Emblem hue={agent.hue} face={agent.face} uid={`card-${agent.id}`} photoUrl={agent.avatarUrl} />
        <span className={`badge${running ? " running" : ""}`}>{running ? "Running" : "Idle"}</span>
      </span>
      <span className="agent-card-body">
        <span className="agent-nm">{agent.name}</span>
        <div className="agent-rl">{agent.role}</div>
        <div className="stat-row">
          <span className="stat">
            <span className="v">{total}</span>
            <br />
            <span className="k">Tasks</span>
          </span>
          <span className="stat">
            <span className="v">{fmtRate(stats)}</span>
            <br />
            <span className="k">Success</span>
          </span>
          <span className="stat">
            <span className="v">{fmtAvg(stats)}</span>
            <br />
            <span className="k">Avg time</span>
          </span>
        </div>
      </span>
    </Link>
  );
}

export function AgentGrid({
  agents,
  stats,
}: {
  agents: AgentDTO[];
  stats: Map<string, AgentStats>;
}) {
  return (
    <div className="agent-grid">
      {agents.map((a) => (
        <AgentCard key={a.id} agent={a} stats={stats.get(a.id)} />
      ))}
      <AddAgentButton className="slot-card">
        <span className="slot-plus">+</span>
        <span>
          <b>New teammate</b>
          <br />
          Add a specialist to the team
        </span>
      </AddAgentButton>
    </div>
  );
}
