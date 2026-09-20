import {
  sqliteTable,
  text,
  integer,
  index,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Statuses and kinds are plain text columns; the API layer enforces the
 * enums with zod (src/server/validation.ts). Swapping to Postgres later
 * means changing the dialect and, if wanted, promoting these to pg enums.
 * JSON-ish fields (face, teamAgentIds, payload) are JSON stored as text,
 * also zod-validated at the boundary.
 */

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // "atlas" etc. for core, cuid-ish for custom
  name: text("name").notNull(),
  role: text("role").notNull(),
  specialty: text("specialty").notNull(),
  hue: integer("hue").notNull(),
  face: text("face").notNull(), // JSON FaceConfig
  isCore: integer("is_core", { mode: "boolean" }).notNull().default(false),
  spec: text("spec").notNull().default("{}"), // JSON AgentSpec, zod-validated at API boundary
  status: text("status").notNull().default("active"), // active | paused (zod enum)
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  teamAgentIds: text("team_agent_ids"), // JSON string[] | null = lead chooses
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  task: text("task").notNull(),
  status: text("status").notNull(), // planning | running | done | failed | stopped
  tierMode: text("tier_mode").notNull(), // fast | thorough
  trigger: text("trigger").notNull().default("manual"), // manual | webhook | schedule (zod enum)
  triggerRef: text("trigger_ref"), // webhook id / schedule id / null
  kind: text("kind").notNull().default("mission"), // mission | watcher (watchers run in M4)
  leadAgentId: text("lead_agent_id").references(() => agents.id),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  workflowId: text("workflow_id").references(() => workflows.id, {
    onDelete: "set null",
  }),
});

export const taskNodes = sqliteTable(
  "task_nodes",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    parentAgentId: text("parent_agent_id")
      .notNull()
      .references(() => agents.id),
    // nesting for v1.5 spawn_subagent
    parentNodeId: text("parent_node_id").references(
      (): AnySQLiteColumn => taskNodes.id,
    ),
    kind: text("kind").notNull(), // lead | sub | synthesis
    name: text("name").notNull(),
    role: text("role").notNull(),
    instructions: text("instructions").notNull().default(""),
    status: text("status").notNull(), // queued | running | done | failed | stopped
    output: text("output").notNull().default(""),
    errorCode: text("error_code"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
  },
  (t) => [
    index("task_nodes_run_idx").on(t.runId),
    // agent detail view + computed stats
    index("task_nodes_agent_kind_idx").on(t.parentAgentId, t.kind),
  ],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").notNull(), // monotonic per run, for SSE resume
    runId: text("run_id").references(() => runs.id, { onDelete: "cascade" }),
    nodeId: text("node_id"),
    type: text("type").notNull(), // run.created, node.status, node.awaiting_approval, action.requested, action.decided, action.executed, run.stopped, run.done, run.failed
    payload: text("payload").notNull(), // JSON
    at: integer("at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("events_run_seq_idx").on(t.runId, t.seq)],
);

/** Human approval queue: side-effecting agent actions wait here for a decision. */
export const pendingActions = sqliteTable(
  "pending_actions",
  {
    id: text("id").primaryKey(), // ap_
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    nodeId: text("node_id").references(() => taskNodes.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    kind: text("kind").notNull(), // tool name, e.g. "send_message"
    title: text("title").notNull(), // human-readable, e.g. "Send SMS to John Smith"
    payload: text("payload").notNull(), // JSON of the proposed tool input
    status: text("status").notNull().default("pending"), // pending | approved | rejected | superseded
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("pending_actions_status_idx").on(t.status)],
);

/** Key-value settings table. Today: the kill switch. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});

export type AgentRow = typeof agents.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type TaskNodeRow = typeof taskNodes.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type PendingActionRow = typeof pendingActions.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
