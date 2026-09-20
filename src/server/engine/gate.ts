import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";
import type { Autonomy } from "@/lib/types";
import type { ActionContext, ToolDefinition, ToolResult } from "@/server/connectors/types";
import { emitEvent } from "./events";
import { killSwitchOn, stopRun } from "./settings";

export type GateOutcome = "executed" | "paused" | "stopped";

export interface GateResult {
  outcome: GateOutcome;
  /** Present when outcome is "executed". */
  result?: ToolResult;
  /** Present when outcome is "paused". */
  actionId?: string;
}

export interface ToolCallRequest {
  runId: string;
  nodeId: string;
  agentId: string;
  agentName: string;
  autonomy: Autonomy;
  tool: ToolDefinition;
  /** Raw proposed input; validated against the tool's inputSchema here. */
  input: unknown;
  /** Human-readable title for the approval card, e.g. "Send SMS to +1555…". */
  title: string;
}

const ctxOf = (r: ToolCallRequest): ActionContext => ({
  runId: r.runId,
  nodeId: r.nodeId,
  agentId: r.agentId,
});

/**
 * Run one tool execution. The kill switch is checked before EVERY execution,
 * at any autonomy level; when on, the run halts immediately.
 */
async function execute(tool: ToolDefinition, input: unknown, ctx: ActionContext): Promise<ToolResult> {
  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The approval gate. Every agent tool call flows through here:
 * - input is validated against the tool's inputSchema (before execute AND before approval)
 * - kill switch stops the run before any execution
 * - draft: pause the node, create a pending action, wait for a human
 * - supervised: execute, then record an auto-approved action for the audit trail
 * - autonomous: execute, events only
 * - non-approval tools execute directly (kill switch still applies)
 */
export async function gateToolCall(req: ToolCallRequest): Promise<GateResult> {
  const ctx = ctxOf(req);

  const parsed = req.tool.inputSchema.safeParse(req.input);
  if (!parsed.success) {
    return {
      outcome: "executed",
      result: {
        ok: false,
        error: `Invalid tool input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      },
    };
  }
  const input = parsed.data;

  if (await killSwitchOn()) {
    await stopRun(req.runId, "kill switch engaged before tool execution");
    return { outcome: "stopped" };
  }

  if (!req.tool.requiresApproval) {
    const result = await execute(req.tool, input, ctx);
    await emitEvent(
      req.runId,
      "action.executed",
      { tool: req.tool.name, agentId: req.agentId, ok: result.ok },
      req.nodeId,
    );
    return { outcome: "executed", result };
  }

  if (req.autonomy === "autonomous") {
    const result = await execute(req.tool, input, ctx);
    await emitEvent(
      req.runId,
      "action.executed",
      {
        tool: req.tool.name,
        agentId: req.agentId,
        decidedBy: "auto (autonomous)",
        ok: result.ok,
      },
      req.nodeId,
    );
    return { outcome: "executed", result };
  }

  if (req.autonomy === "supervised") {
    const result = await execute(req.tool, input, ctx);
    await db.insert(schema.pendingActions).values({
      id: newId("ap_"),
      runId: req.runId,
      nodeId: req.nodeId,
      agentId: req.agentId,
      kind: req.tool.name,
      title: req.title,
      payload: JSON.stringify(input),
      status: "approved",
      decidedBy: "auto (supervised)",
      decidedAt: new Date(),
    });
    await emitEvent(
      req.runId,
      "action.decided",
      {
        tool: req.tool.name,
        agentId: req.agentId,
        decision: "approved",
        decidedBy: "auto (supervised)",
        ok: result.ok,
      },
      req.nodeId,
    );
    return { outcome: "executed", result };
  }

  // draft: do NOT execute — park it for a human.
  const actionId = newId("ap_");
  await db.insert(schema.pendingActions).values({
    id: actionId,
    runId: req.runId,
    nodeId: req.nodeId,
    agentId: req.agentId,
    kind: req.tool.name,
    title: req.title,
    payload: JSON.stringify(input),
    status: "pending",
  });
  await db
    .update(schema.taskNodes)
    .set({ status: "awaiting_approval" })
    .where(eq(schema.taskNodes.id, req.nodeId));
  await emitEvent(
    req.runId,
    "action.requested",
    { actionId, tool: req.tool.name, agentId: req.agentId, title: req.title, payload: input },
    req.nodeId,
  );
  await emitEvent(
    req.runId,
    "node.awaiting_approval",
    { nodeId: req.nodeId, agentName: req.agentName, actionId, title: req.title },
    req.nodeId,
  );
  return { outcome: "paused", actionId };
}

/** Human-readable title for an approval card. Falls back to the tool name. */
export function actionTitle(toolName: string, input: unknown): string {
  if (input && typeof input === "object") {
    const r = input as Record<string, unknown>;
    const target = [r.to, r.recipient, r.contact, r.person].find((v) => typeof v === "string");
    if (typeof target === "string") return `${toolName} → ${target}`;
  }
  return toolName;
}
