import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseSpec } from "@/lib/agentSpec";
import type { AgentDTO, AgentStats, FaceConfig } from "@/lib/types";

export function toAgentDTO(row: typeof schema.agents.$inferSelect): AgentDTO {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    specialty: row.specialty,
    hue: row.hue,
    face: JSON.parse(row.face) as FaceConfig,
    avatarUrl: row.avatarUrl ?? null,
    isCore: row.isCore,
    spec: parseSpec(row.spec, row.name, row.role, row.specialty),
    status: row.status === "paused" ? "paused" : "active",
  };
}

export async function listAgents(): Promise<AgentDTO[]> {
  const rows = await db.select().from(schema.agents).orderBy(schema.agents.createdAt);
  // Core roster first, in seed order; customs after by creation time.
  const coreOrder = ["atlas", "scout", "forge", "prism", "quill", "warden"];
  return rows
    .map(toAgentDTO)
    .sort((a, b) => {
      const ai = coreOrder.indexOf(a.id);
      const bi = coreOrder.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
    });
}

export async function getAgent(id: string): Promise<AgentDTO | null> {
  const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  return rows[0] ? toAgentDTO(rows[0]) : null;
}

/** Stats are computed from TaskNodes, never stored. Empty DB → zeros. */
export async function agentStats(): Promise<Map<string, AgentStats>> {
  const rows = await db
    .select({
      agentId: schema.taskNodes.parentAgentId,
      status: schema.taskNodes.status,
      n: sql<number>`count(*)`,
      ms: sql<number>`coalesce(sum(case when ${schema.taskNodes.status} = 'done' and ${schema.taskNodes.finishedAt} is not null and ${schema.taskNodes.startedAt} is not null then ${schema.taskNodes.finishedAt} - ${schema.taskNodes.startedAt} else 0 end), 0)`,
    })
    .from(schema.taskNodes)
    .groupBy(schema.taskNodes.parentAgentId, schema.taskNodes.status);

  const map = new Map<string, AgentStats>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { done: 0, failed: 0, totalMs: 0, activeNow: 0 }));
    return s;
  };
  for (const r of rows) {
    const s = get(r.agentId);
    if (r.status === "done") {
      s.done += r.n;
      s.totalMs += r.ms;
    } else if (r.status === "failed" || r.status === "stopped") {
      s.failed += r.n;
    } else if (r.status === "running" || r.status === "queued" || r.status === "awaiting_approval") {
      s.activeNow += r.n;
    }
  }
  return map;
}

export interface TileCounts {
  running: number;
  queued: number;
  done: number;
  agents: number;
  workflows: number;
}

export async function tileCounts(): Promise<TileCounts> {
  const [nodeRows, agentRows, wfRows] = await Promise.all([
    db
      .select({ status: schema.taskNodes.status, n: sql<number>`count(*)` })
      .from(schema.taskNodes)
      .where(inArray(schema.taskNodes.status, ["running", "queued", "awaiting_approval", "done"]))
      .groupBy(schema.taskNodes.status),
    db.select({ n: sql<number>`count(*)` }).from(schema.agents),
    db.select({ n: sql<number>`count(*)` }).from(schema.workflows),
  ]);
  const by = Object.fromEntries(nodeRows.map((r) => [r.status, r.n]));
  return {
    running: (by.running ?? 0) + (by.awaiting_approval ?? 0),
    queued: by.queued ?? 0,
    done: by.done ?? 0,
    agents: agentRows[0]?.n ?? 0,
    workflows: wfRows[0]?.n ?? 0,
  };
}

export async function listWorkflows() {
  return db.select().from(schema.workflows).orderBy(schema.workflows.createdAt);
}

export async function recentEvents(limit = 60) {
  return db.select().from(schema.events).orderBy(desc(schema.events.at)).limit(limit);
}

/** All sub-nodes an agent has spawned, newest first — for the agent detail board. */
export async function agentSubNodes(agentId: string) {
  return db
    .select({
      node: schema.taskNodes,
      task: schema.runs.task,
    })
    .from(schema.taskNodes)
    .innerJoin(schema.runs, eq(schema.taskNodes.runId, schema.runs.id))
    .where(and(eq(schema.taskNodes.parentAgentId, agentId), eq(schema.taskNodes.kind, "sub")))
    .orderBy(desc(schema.runs.startedAt));
}

/** Runs, newest first. */
export async function listRuns(limit = 50) {
  return db.select().from(schema.runs).orderBy(desc(schema.runs.startedAt)).limit(limit);
}

export async function getRun(id: string) {
  const rows = await db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Nodes in insertion order (task_nodes has no createdAt; rowid preserves it). */
export async function getRunNodes(runId: string) {
  return db
    .select()
    .from(schema.taskNodes)
    .where(eq(schema.taskNodes.runId, runId))
    .orderBy(sql`rowid`);
}

export interface PendingActionView {
  action: typeof schema.pendingActions.$inferSelect;
  agentName: string;
  runTask: string;
  nodeName: string | null;
}

export async function listPendingActions(status?: string): Promise<PendingActionView[]> {
  const rows = await db
    .select({
      action: schema.pendingActions,
      agentName: schema.agents.name,
      runTask: schema.runs.task,
      nodeName: schema.taskNodes.name,
    })
    .from(schema.pendingActions)
    .innerJoin(schema.agents, eq(schema.pendingActions.agentId, schema.agents.id))
    .innerJoin(schema.runs, eq(schema.pendingActions.runId, schema.runs.id))
    .leftJoin(schema.taskNodes, eq(schema.pendingActions.nodeId, schema.taskNodes.id))
    .where(status ? eq(schema.pendingActions.status, status) : undefined)
    .orderBy(desc(schema.pendingActions.createdAt));
  return rows;
}

export async function getPendingAction(id: string): Promise<PendingActionView | null> {
  const rows = await db
    .select({
      action: schema.pendingActions,
      agentName: schema.agents.name,
      runTask: schema.runs.task,
      nodeName: schema.taskNodes.name,
    })
    .from(schema.pendingActions)
    .innerJoin(schema.agents, eq(schema.pendingActions.agentId, schema.agents.id))
    .innerJoin(schema.runs, eq(schema.pendingActions.runId, schema.runs.id))
    .leftJoin(schema.taskNodes, eq(schema.pendingActions.nodeId, schema.taskNodes.id))
    .where(eq(schema.pendingActions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function pendingApprovalsCount(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.pendingActions)
    .where(eq(schema.pendingActions.status, "pending"));
  return rows[0]?.n ?? 0;
}
