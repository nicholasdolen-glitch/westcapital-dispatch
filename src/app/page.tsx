import Link from "next/link";
import { Suspense } from "react";
import { DispatchBar } from "@/components/command/DispatchBar";
import { AgentGrid } from "@/components/agents/AgentGrid";
import { AddAgentButton, AddAgentDialog } from "@/components/agents/AddAgentDialog";
import { listAgents, agentStats, recentEvents } from "@/server/queries";
import { eventText, eventTime } from "@/lib/eventText";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  const [agents, stats, events] = await Promise.all([listAgents(), agentStats(), recentEvents(6)]);

  return (
    <section>
      <DispatchBar />
      <div className="view-head">
        <h2>Your team</h2>
        <span className="sub">
          Each teammate runs their own subagents per mission. Open anyone to see their board.
        </span>
      </div>
      <AgentGrid agents={agents} stats={stats} />
      <div className="home-cols">
        <div className="panel">
          <h3>Recent activity</h3>
          <div className="feed">
            {events.length === 0 ? (
              <div className="feed-item">
                <span>Dispatch your first mission to see activity here.</span>
              </div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="feed-item">
                  <span className="feed-time">{eventTime(e)}</span>
                  <span>{eventText(e)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel">
          <h3>Quick actions</h3>
          <div className="qa-btns">
            <Link href="/workflows">Create a workflow</Link>
            <AddAgentButton>Add a teammate</AddAgentButton>
            <Link href="/runs">Open live runs</Link>
          </div>
        </div>
      </div>
      <Suspense>
        <AddAgentDialog />
      </Suspense>
    </section>
  );
}
