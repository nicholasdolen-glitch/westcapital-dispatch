import { listAgents } from "@/server/queries";
import { getChatMessages } from "@/server/chat";
import { ChatClient } from "@/components/chat/ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const agents = await listAgents();
  const active = agents.filter((a) => a.status === "active");
  const params = await searchParams;
  const selected =
    active.find((a) => a.id === params.agent) ??
    active.find((a) => a.id === "atlas") ??
    active[0];

  const initialMessages = selected ? await getChatMessages(selected.id) : [];

  return (
    <section>
      <div className="view-head">
        <h2>Chat</h2>
        <span className="sub">Talk directly with your teammates.</span>
      </div>
      {selected ? (
        <ChatClient agents={active} initialAgentId={selected.id} initialMessages={initialMessages} />
      ) : (
        <div className="feed-item">
          <span>No active teammates yet.</span>
        </div>
      )}
    </section>
  );
}
