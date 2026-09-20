import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseSpec } from "@/lib/agentSpec";
import { decisionSchema } from "@/server/validation";
import { findToolForSpec } from "@/server/connectors/registry";
import { getPendingAction, getRun } from "@/server/queries";
import { resumeNodeLoop, maxTokensFor } from "@/server/engine/runner";
import { emitEvent } from "@/server/engine/events";
import { killSwitchOn, stopRun } from "@/server/engine/settings";
import type { ToolResult } from "@/server/connectors/types";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Say approved or rejected.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { decision, editedPayload, reason } = parsed.data;

  const view = await getPendingAction(id);
  if (!view) return NextResponse.json({ error: "No such action." }, { status: 404 });
  if (view.action.status !== "pending") {
    return NextResponse.json(
      { error: `This action was already ${view.action.status}.` },
      { status: 409 },
    );
  }
  if (!view.action.nodeId) {
    return NextResponse.json({ error: "This action has no node to resume." }, { status: 409 });
  }

  const agentRows = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, view.action.agentId))
    .limit(1);
  const agent = agentRows[0];
  if (!agent) return NextResponse.json({ error: "The agent is gone." }, { status: 409 });
  const spec = parseSpec(agent.spec, agent.name, agent.role, agent.specialty);
  const tool = findToolForSpec(spec, view.action.kind);
  if (!tool) {
    return NextResponse.json(
      { error: `Tool ${view.action.kind} is not available to ${agent.name} anymore.` },
      { status: 409 },
    );
  }

  const run = await getRun(view.action.runId);
  if (!run || !["running", "planning"].includes(run.status)) {
    return NextResponse.json({ error: "The run is no longer active." }, { status: 409 });
  }

  if (decision === "approved") {
    const candidate = editedPayload !== undefined ? editedPayload : JSON.parse(view.action.payload);
    const checked = tool.inputSchema.safeParse(candidate);
    if (!checked.success) {
      return NextResponse.json(
        {
          error: "The edited payload doesn't fit the tool's input.",
          issues: checked.error.issues,
        },
        { status: 400 },
      );
    }
    if (await killSwitchOn()) {
      await stopRun(view.action.runId, "kill switch engaged on approval");
      return NextResponse.json({ error: "Kill switch is on; the run was stopped." }, { status: 409 });
    }

    await db
      .update(schema.pendingActions)
      .set({ status: "approved", decidedBy: "human", decidedAt: new Date() })
      .where(eq(schema.pendingActions.id, id));
    await emitEvent(
      view.action.runId,
      "action.decided",
      {
        actionId: id,
        tool: view.action.kind,
        agentId: view.action.agentId,
        decision: "approved",
        decidedBy: "human",
        edited: editedPayload !== undefined,
      },
      view.action.nodeId,
    );

    let result: ToolResult;
    try {
      result = await tool.execute(checked.data, {
        runId: view.action.runId,
        nodeId: view.action.nodeId,
        agentId: view.action.agentId,
      });
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    resumeNodeLoop(view.action.runId, view.action.nodeId, id, result, maxTokensFor(run.tierMode));
    return NextResponse.json({ id, decision: "approved", toolOk: result.ok });
  }

  // rejected — the agent gets the rejection as a tool result so it can adapt
  const rejection: ToolResult = {
    ok: false,
    error: `The human rejected this action${reason ? `: ${reason}` : "."}`,
  };
  await db
    .update(schema.pendingActions)
    .set({ status: "rejected", decidedBy: "human", decidedAt: new Date() })
    .where(eq(schema.pendingActions.id, id));
  await emitEvent(
    view.action.runId,
    "action.decided",
    {
      actionId: id,
      tool: view.action.kind,
      agentId: view.action.agentId,
      decision: "rejected",
      decidedBy: "human",
      reason: reason ?? null,
    },
    view.action.nodeId,
  );
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  resumeNodeLoop(view.action.runId, view.action.nodeId, id, rejection, maxTokensFor(run.tierMode));
  return NextResponse.json({ id, decision: "rejected" });
}
