import type { EventRow } from "@/db/schema";

export function eventText(e: EventRow): string {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(e.payload) as Record<string, unknown>;
  } catch {
    /* leave empty */
  }
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  switch (e.type) {
    case "system.seeded":
      return "Command center online";
    case "agent.added":
      return `Teammate added: ${s("name")}`;
    case "agent.removed":
      return `Removed teammate ${s("name")}`;
    case "workflow.created":
      return `Workflow created: ${s("name")}`;
    case "workflow.deleted":
      return `Workflow deleted: ${s("name")}`;
    case "run.created":
      return `Mission dispatched: ${s("task").slice(0, 60)}`;
    case "run.done":
      return `Mission finished: ${s("task").slice(0, 50)}`;
    case "run.failed":
      return `Mission failed: ${s("error").slice(0, 60)}`;
    case "run.stopped":
      return `Run stopped: ${s("reason").slice(0, 60)}`;
    case "node.status":
      return `${s("name")} → ${s("status")}`;
    case "node.awaiting_approval":
      return `${s("agentName")} is waiting on approval: ${s("title").slice(0, 60)}`;
    case "action.requested":
      return `Approval requested: ${s("title").slice(0, 60)}`;
    case "action.decided": {
      const by = s("decidedBy");
      return `Action ${s("decision")}${by ? ` by ${by}` : ""}: ${s("tool")}`;
    }
    case "action.executed":
      return `Tool ran (${s("decidedBy") || "direct"}): ${s("tool")}`;
    case "agent.updated":
      return `Teammate updated: ${(p["fields"] as string[] | undefined)?.join(", ") ?? ""}`;
    default:
      return e.type;
  }
}

export function eventTime(e: EventRow): string {
  return new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
