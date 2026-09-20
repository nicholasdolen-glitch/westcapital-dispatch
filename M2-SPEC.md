# M2 Build Spec — Run Engine + Agent Config + Approval Queue

**Goal:** milestone 2 of the Dispatch agent dashboard (project: agent-dashboard-for-the-loan-business).
**Starting point:** the milestone-1 scaffold in this directory (`dispatch/`). M1 is done: schema, seed,
roster UI, dispatch bar (UI only), agent detail, workflows (read-only), activity feed, zod validation on all
API inputs, Drizzle + SQLite (libsql) portable to Postgres.

**M2 delivers three things:**
1. **Run engine** — `POST /api/runs` executes end-to-end: plan → concurrent subagent nodes → synthesis,
   with SSE streaming of run events.
2. **Agent config format** — agents become specs (model, connectors, permissions, autonomy, triggers,
   system prompt), stored in DB and importable/exportable as JSON.
3. **Approval queue** — side-effecting agent actions pause for human approval; autonomy is a per-agent
   setting (`draft` | `supervised` | `autonomous`), default `draft`.

Conventions to follow (already established in this codebase):
- TypeScript strict, Next.js App Router, Drizzle ORM, zod validation on **every** API input/output boundary
  (`src/server/validation.ts`).
- Statuses as text columns, enums enforced by zod. JSON fields as text, zod-validated at the boundary.
- ID prefixes: `ag_` agents, `ev_` events, `run_` runs, `nd_` nodes, `ap_` approvals, `wf_` workflows.
- Events table uses per-run monotonic `seq` for SSE resume — keep this pattern.

---

## 1. Schema changes (`src/db/schema.ts`)

Add a `spec` JSON column and `status` to `agents`:

```ts
// agents additions:
spec: text("spec").notNull().default("{}"),   // JSON AgentSpec, zod-validated at API boundary
status: text("status").notNull().default("active"), // active | paused (zod enum)
```

`runs` additions:

```ts
trigger: text("trigger").notNull().default("manual"), // manual | webhook | schedule (zod enum)
triggerRef: text("trigger_ref"),                       // webhook id / schedule id / null
kind: text("kind").notNull().default("mission"),       // mission | watcher (watchers run in M4)
leadAgentId: text("lead_agent_id").references(() => agents.id),
```

New table `pending_actions`:

```ts
export const pendingActions = sqliteTable("pending_actions", {
  id: text("id").primaryKey(),              // ap_
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  nodeId: text("node_id").references(() => taskNodes.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull().references(() => agents.id),
  kind: text("kind").notNull(),             // tool name, e.g. "send_message"
  title: text("title").notNull(),           // human-readable, e.g. "Send SMS to John Smith"
  payload: text("payload").notNull(),       // JSON of the proposed tool input
  status: text("status").notNull().default("pending"), // pending | approved | rejected | superseded
  decidedBy: text("decided_by"),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("pending_actions_status_idx").on(t.status)]);
```

New table `settings` (key-value, for the kill switch):

```ts
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});
```
Seed `settings` with `{ key: "kill_switch", value: "false" }`.

`taskNodes.status` gains a new value: `awaiting_approval` (update `NODE_STATUSES` in `src/lib/types.ts`).

New event types (document in code): `run.created`, `node.status`, `node.awaiting_approval`,
`action.requested`, `action.decided`, `run.done`, `run.failed`.

---

## 2. Agent spec format (`src/lib/agentSpec.ts` + zod in validation.ts)

```ts
interface AgentSpec {
  model: { provider: "anthropic"; model: string }; // default: "claude-opus-4-6" — overridable per agent
  systemPrompt: string;                            // max 4000 chars
  connectors: Array<{ platform: "bonzo" | "follow_up_boss" | "monday" | "arive";
                      permissions: "read" | "write" }>;
  autonomy: "draft" | "supervised" | "autonomous";  // default "draft"
  triggers: Array<
    | { type: "manual" }
    | { type: "schedule"; cron: string }
    | { type: "webhook"; platform: string; event: string }
  >;
  maxSteps: number; // default 12, max 40 — tool-calling loop budget per node
}
```

- Zod schema `agentSpecSchema` in `src/server/validation.ts`; validate on agent create/update and on
  import.
- `GET /api/agents/[id]/export` returns the full spec as downloadable JSON.
  `POST /api/agents/import` accepts that JSON (new id, `isCore: false`).
- Seed: give the six core agents a default spec (autonomy `draft`, connectors `[]`, trigger manual).
  The lead agent (`atlas`) gets a slightly larger `maxSteps` (20).

---

## 3. Connector tool interface (`src/server/connectors/types.ts`) — DEFINED in M2, IMPLEMENTED in M3

```ts
interface ToolDefinition {
  name: string;                    // e.g. "send_message"
  description: string;             // shown to the model
  inputSchema: z.ZodTypeAny;       // validated before execute AND before approval
  requiresApproval: boolean;       // true for anything side-effecting
  execute: (input: unknown, ctx: ActionContext) => Promise<ToolResult>;
}
interface Connector {
  platform: "bonzo" | "follow_up_boss" | "monday" | "arive";
  tools(): ToolDefinition[];
  status(): Promise<{ ok: boolean; detail?: string }>;
}
interface ActionContext { runId: string; nodeId: string; agentId: string; }
type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };
```

- `src/server/connectors/registry.ts`: `getToolsForSpec(spec: AgentSpec): ToolDefinition[]`.
  In M2 the registry returns an empty list (no real connectors yet) — but the interface and the
  approval gating around it must be real and tested.
- **Approval gate rule (the important one):** when the agent's tool loop wants to call a tool with
  `requiresApproval: true`:
  - If agent autonomy is `draft` → do NOT execute. Create a `pending_actions` row (status `pending`),
    set the node status to `awaiting_approval`, emit `action.requested` + `node.awaiting_approval`
    events, and pause the loop.
  - If `supervised` → execute, then create a `pending_actions` row with status `approved`,
    `decidedBy: "auto (supervised)"` for the audit trail, and emit `action.decided`.
  - If `autonomous` → execute, log to events only.
  - Before EVERY tool execution (any autonomy level): check the `kill_switch` setting; if true,
    stop the run immediately with status `stopped`.
  - `read`-permission connectors never expose `requiresApproval` tools; a `write` permission is
    required for the tool to be offered to the model at all.

---

## 4. Run engine (`src/server/engine/`)

- `POST /api/runs` (existing `dispatchSchema`) → create run (`planning`), then:
  1. **Plan:** call the lead agent (`leadAgentId` or `atlas`) with the task; it must return JSON matching
     the existing `planSchema` (2–8 subagents). Store as `task_nodes` rows (kind `sub`, status `queued`).
     If the plan call fails or returns invalid JSON after 2 retries → run `failed`, emit `run.failed`.
  2. **Execute:** run sub nodes concurrently (cap: 4 at a time). Each node runs the **tool loop**:
     system prompt (agent spec) + node instructions → model → tool calls → tool results → repeat until
     the model returns a final answer or `maxSteps` is hit. Node output = final answer text.
     Token counts stored on the node (`tokensIn`/`tokensOut`).
  3. **Synthesis:** lead agent merges sub outputs into the run result (node kind `synthesis`).
  4. Run → `done`, emit `run.done`. Any node failure → node `failed`, run continues; run `failed` only
     if all nodes fail or planning/synthesis fails.
- Model client: add `@anthropic-ai/sdk` dependency. `ANTHROPIC_API_KEY` from env. All model calls go
  through `src/server/engine/model.ts` so provider swaps stay in one place.
- Node interruption: `POST /api/runs/[id]/stop` sets run `stopped`; the tool loop checks run status
  between steps and aborts.
- **SSE:** `GET /api/runs/[id]/events` — Server-Sent Events stream; accepts `?fromSeq=` to resume using
  the existing per-run `seq`. Emit every event row for the run as it is inserted.

---

## 5. Approval queue API + UI

- `GET /api/approvals?status=pending` → list with agent name, run task, kind, title, payload, createdAt.
- `POST /api/approvals/[id]/decision` body `{ decision: "approved" | "rejected", editedPayload?: unknown }`
  - Validate `editedPayload` against the tool's `inputSchema` when provided.
  - On `approved`: set row `approved`, then **resume the node**: execute the tool with the (possibly
    edited) payload, feed the result back into the node's tool loop, node back to `running`.
    Emit `action.decided` + `node.status`.
  - On `rejected`: set row `rejected`; feed "The human rejected this action: <reason?>" back into the
    node's loop as a tool result so the agent can adapt; node back to `running`.
- UI: new `/approvals` page (add to sidebar nav) — pending action cards with Approve / Edit / Reject.
  Editing shows the payload as JSON in a textarea, validated on submit. Badge count of pending approvals
  in the sidebar (poll every 15s — SSE for global events is a later milestone).
- Run detail view (`/runs` exists as a page; wire it): show nodes, live status via the SSE endpoint,
  and any linked pending actions.

---

## 6. Verification required

- `npm install`, `npx tsc --noEmit` clean, `npm run build` succeeds.
- `npm run setup` (drizzle push + seed) runs clean on a fresh DB; seed includes default specs and the
  `kill_switch` setting.
- Manual API test script (document the curl commands you ran in your final report):
  - create agent with a spec → export → import round-trips;
  - dispatch a run with `ANTHROPIC_API_KEY` set → plan → nodes → synthesis → `done`, events stream via SSE;
  - approval gate: register a **test-only stub connector** (in `src/server/connectors/stub.ts`, clearly
    marked as M2 test scaffolding to be replaced in M3) exposing one `requiresApproval` tool
    (`send_test_message`); dispatch a run whose node calls it; assert the node pauses with
    `awaiting_approval`, the action appears in `GET /api/approvals`, approving resumes the node and the
    stub executes; rejecting feeds back into the loop. Then DELETE the stub's registration from the
    default registry (leave the file, unregistered) so M3 starts clean.
  - kill switch: set `kill_switch` true mid-run → run stops.
- Do NOT commit secrets. Do NOT add dependencies beyond `@anthropic-ai/sdk` without noting why.

## Out of scope for M2 (do not build)

Real platform connectors (M3), webhook receivers (M4), scheduler/cron runner (M4), the hot-list digest
(M4), dashboard auth/login (M5), Postgres migration (works via Drizzle config change; not this milestone).
