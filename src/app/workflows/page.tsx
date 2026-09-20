import { listWorkflows, listAgents } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function Workflows() {
  const [workflows, agents] = await Promise.all([listWorkflows(), listAgents()]);
  const byId = new Map(agents.map((a) => [a.id, a]));

  return (
    <section>
      <div className="view-head">
        <h2>Workflows</h2>
        <span className="sub">Saved missions with a preset team. Run them in one click.</span>
      </div>
      <div className="wf-list">
        {workflows.map((w) => {
          const team = w.teamAgentIds ? (JSON.parse(w.teamAgentIds) as string[]) : [];
          return (
            <div className="wf-card" key={w.id}>
              <h3>{w.name}</h3>
              <div className="desc">{w.prompt}</div>
              <div className="wf-team">
                {team.length === 0 ? (
                  <span className="team-chip">Elena picks the team</span>
                ) : (
                  team.map((id) => {
                    const a = byId.get(id);
                    return a ? (
                      <span className="team-chip" key={id}>
                        <span
                          className="nav-agent-dot"
                          style={{ background: `hsl(${a.hue} 70% 55%)` }}
                        />
                        {a.name}
                      </span>
                    ) : null;
                  })
                )}
              </div>
              <div className="wf-actions">
                <button className="run-btn" disabled title="Running workflows arrives with the run engine in milestone 2">
                  Run
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="empty">
        <b>Creating and running workflows lands with the run engine</b>
        Milestone 2 wires Run to real dispatches; the create form follows in milestone 3.
      </div>
    </section>
  );
}
