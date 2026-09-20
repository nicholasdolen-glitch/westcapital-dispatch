import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/id";
import type { AgentSpec } from "@/lib/agentSpec";
import { parseSpec } from "@/lib/agentSpec";
import type { AgentRow, TaskNodeRow } from "@/db/schema";
import type { DispatchInput, Plan } from "@/server/validation";
import { planSchema } from "@/server/validation";
import { getToolsForSpec } from "@/server/connectors/registry";
import type { ToolDefinition, ToolResult } from "@/server/connectors/types";
import { complete, messageText, toolUses } from "./model";
import { gateToolCall, actionTitle } from "./gate";
import { emitEvent } from "./events";
import { stopRun } from "./settings";

/**
 * Run engine: plan → concurrent subagent tool loops → synthesis.
 * Runs in-process in the background after POST /api/runs returns.
 *
 * M2 TEST HOOK: when DISPATCH_TEST_TOOL_LOOP=1 (never in production), model
 * calls are skipped — the plan is a single node and the node loop directly
 * requests the first approval-required tool. Everything else (approval gate,
 * pause/resume, kill switch, events) runs for real.
 */
const TEST_LOOP = process.env.DISPATCH_TEST_TOOL_LOOP === "1";

const TEST_TOOL_INPUTS: Record<string, unknown> = {
  send_test_message: { to: "+15551234567", text: "M2 verification message" },
};

/** In-memory tool-loop state for nodes paused in awaiting_approval (same process). */
interface LoopState {
  history: Anthropic.MessageParam[];
}
const g = globalThis as unknown as { __dispatchLoops?: Map<string, LoopState> };
const loopStates: Map<string, LoopState> =
  g.__dispatchLoops ?? (g.__dispatchLoops = new Map());

async function getRunStatus(runId: string): Promise<string | null> {
  const rows = await db.select({ status: schema.runs.status }).from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  return rows[0]?.status ?? null;
}

async function setNode(
  nodeId: string,
  patch: Partial<Pick<TaskNodeRow, "status" | "output" | "errorCode" | "startedAt" | "finishedAt" | "tokensIn" | "tokensOut">>,
) {
  await db.update(schema.taskNodes).set(patch).where(eq(schema.taskNodes.id, nodeId));
}

async function failRun(runId: string, error: string) {
  await db
    .update(schema.runs)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(schema.runs.id, runId));
  await emitEvent(runId, "run.failed", { error });
}

function maxTokensFor(tier: string): number {
  return tier === "thorough" ? 4096 : 1024;
}

export { maxTokensFor };

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try {
        return JSON.parse(m[1]!.trim());
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Entry point from POST /api/runs. Never throws — failures land on the run row. */
export async function startRun(runId: string, input: DispatchInput): Promise<void> {
  try {
    await runMission(runId, input);
  } catch (err) {
    await failRun(runId, err instanceof Error ? err.message : String(err));
  }
}

async function runMission(runId: string, input: DispatchInput): Promise<void> {
  const runRows = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  const run = runRows[0];
  if (!run) return;

  const leadId = input.leadAgentId ?? "atlas";
  const leadRows = await db.select().from(schema.agents).where(eq(schema.agents.id, leadId)).limit(1);
  const lead = leadRows[0];
  if (!lead) {
    await failRun(runId, `Lead agent ${leadId} not found`);
    return;
  }
  const leadSpec = parseSpec(lead.spec, lead.name, lead.role, lead.specialty);
  const maxTokens = maxTokensFor(run.tierMode);

  await db
    .update(schema.runs)
    .set({ status: "planning", leadAgentId: leadId, trigger: "manual", kind: "mission" })
    .where(eq(schema.runs.id, runId));

  // ---- 1. Plan ----
  let plan: Plan;
  if (TEST_LOOP) {
    plan = {
      plan: [
        {
          agentId: leadId,
          subName: "Test node",
          role: "test",
          instructions: "TEST MODE: call the approval-required tool once.",
        },
      ],
    };
  } else {
    const teamRows = await db.select().from(schema.agents).where(eq(schema.agents.status, "active"));
    const team = input.teamAgentIds
      ? teamRows.filter((a) => input.teamAgentIds!.includes(a.id))
      : teamRows;
    const roster = team.map((a) => `- ${a.id}: ${a.name}, ${a.role} — ${a.specialty}`).join("\n");
    const planPrompt =
      `The mission:\n${input.task}\n\n` +
      `Available teammates:\n${roster}\n\n` +
      `Split the mission into 2-8 subagent tasks. Reply with ONLY JSON matching this schema, no other text:\n` +
      `{"plan": [{"agentId": "<teammate id>", "subName": "<short name>", "role": "<their role on this task>", "instructions": "<what to do>"}]}`;

    let parsed: Plan | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
      try {
        const msg = await complete({
          model: leadSpec.model.model,
          system: leadSpec.systemPrompt,
          messages: [{ role: "user", content: planPrompt }],
          maxTokens,
        });
        const json = extractJson(messageText(msg));
        const check = planSchema.safeParse(json);
        if (check.success) parsed = check.data;
        else lastError = check.error.issues.map((i) => i.message).join("; ");
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (!parsed) {
      await failRun(runId, `Planning failed after 3 attempts: ${lastError}`);
      return;
    }
    plan = parsed;
  }

  // Keep only plan entries that name a real agent.
  const agentIds = new Set(
    (await db.select({ id: schema.agents.id }).from(schema.agents)).map((a) => a.id),
  );
  const entries = plan.plan.filter((p) => agentIds.has(p.agentId));
  if (entries.length === 0) {
    await failRun(runId, "Plan named no valid teammates");
    return;
  }

  const nodeRows: TaskNodeRow[] = [];
  for (const p of entries) {
    const [node] = await db
      .insert(schema.taskNodes)
      .values({
        id: newId("nd_"),
        runId,
        parentAgentId: p.agentId,
        kind: "sub",
        name: p.subName,
        role: p.role,
        instructions: p.instructions,
        status: "queued",
      })
      .returning();
    nodeRows.push(node!);
    await emitEvent(runId, "node.status", { nodeId: node!.id, name: p.subName, status: "queued" }, node!.id);
  }

  await db.update(schema.runs).set({ status: "running" }).where(eq(schema.runs.id, runId));

  // ---- 2. Execute sub nodes concurrently (cap 4) ----
  await mapLimit(nodeRows, 4, (n) => runNode(runId, n.id, maxTokens));

  // Nodes may be paused in awaiting_approval — wait for humans before synthesizing.
  const nodeIds = nodeRows.map((n) => n.id);
  const finalNodes = await waitForNodes(runId, nodeIds);
  const rs = await getRunStatus(runId);
  if (rs !== "running") return; // stopped externally (kill switch or /stop)

  const succeeded = finalNodes.filter((n) => n.status === "done");
  if (succeeded.length === 0) {
    await failRun(runId, "All subagent nodes failed");
    return;
  }

  // ---- 3. Synthesis ----
  try {
    const summary = succeeded
      .map((n) => `### ${n.name} (${n.role})\n${n.output}`)
      .join("\n\n");
    let finalText: string;
    if (TEST_LOOP) {
      finalText = `TEST MODE synthesis of ${succeeded.length} node(s).`;
    } else {
      const msg = await complete({
        model: leadSpec.model.model,
        system: leadSpec.systemPrompt,
        messages: [
          {
            role: "user",
            content:
              `The mission was:\n${input.task}\n\n` +
              `Merge these subagent results into one clear final answer:\n\n${summary}`,
          },
        ],
        maxTokens,
      });
      finalText = messageText(msg);
    }
    const [syn] = await db
      .insert(schema.taskNodes)
      .values({
        id: newId("nd_"),
        runId,
        parentAgentId: leadId,
        kind: "synthesis",
        name: "Synthesis",
        role: "Final answer",
        instructions: "",
        status: "done",
        output: finalText,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    await emitEvent(
      runId,
      "node.status",
      { nodeId: syn!.id, name: "Synthesis", status: "done" },
      syn!.id,
    );
  } catch (err) {
    await failRun(runId, `Synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // ---- 4. Done ----
  await db
    .update(schema.runs)
    .set({ status: "done", finishedAt: new Date() })
    .where(eq(schema.runs.id, runId));
  await emitEvent(runId, "run.done", { task: input.task });
}

async function loadAgent(agentId: string): Promise<{ row: AgentRow; spec: AgentSpec } | null> {
  const rows = await db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { row, spec: parseSpec(row.spec, row.name, row.role, row.specialty) };
}

/** Run one node's tool loop to completion, pause, or stop. Node failures never throw. */
export async function runNode(runId: string, nodeId: string, maxTokens: number): Promise<void> {
  try {
    const nodeRows = await db.select().from(schema.taskNodes).where(eq(schema.taskNodes.id, nodeId)).limit(1);
    const node = nodeRows[0];
    if (!node) return;
    const agent = await loadAgent(node.parentAgentId);
    if (!agent) {
      await setNode(nodeId, { status: "failed", errorCode: "agent-missing", finishedAt: new Date() });
      return;
    }
    await setNode(nodeId, { status: "running", startedAt: new Date() });
    await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "running" }, nodeId);

    const tools = getToolsForSpec(agent.spec);

    if (TEST_LOOP) {
      await testLoop(runId, node, agent, tools);
      return;
    }

    const history: Anthropic.MessageParam[] = [
      {
        role: "user",
        content:
          `Mission context: ${(await db.select({ task: schema.runs.task }).from(schema.runs).where(eq(schema.runs.id, runId)).limit(1))[0]?.task ?? ""}\n\n` +
          `Your task: ${node.instructions}`,
      },
    ];
    const outcome = await toolLoop({
      runId,
      node,
      agentName: agent.row.name,
      spec: agent.spec,
      tools,
      history,
      maxTokens,
    });
    if (outcome.status === "done") {
      await setNode(nodeId, {
        status: "done",
        output: outcome.output ?? "",
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        finishedAt: new Date(),
      });
      await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "done" }, nodeId);
    }
    // "paused" and "stopped" are already recorded by the loop/gate.
  } catch (err) {
    await setNode(nodeId, {
      status: "failed",
      errorCode: "node-error",
      output: err instanceof Error ? err.message : String(err),
      finishedAt: new Date(),
    });
    await emitEvent(runId, "node.status", { nodeId, name: "", status: "failed" }, nodeId);
  }
}

interface LoopArgs {
  runId: string;
  node: TaskNodeRow;
  agentName: string;
  spec: AgentSpec;
  tools: ToolDefinition[];
  history: Anthropic.MessageParam[];
  maxTokens: number;
  /** Resume from a human decision: the paused tool call to answer. */
  resume?: { toolCallId: string; result: ToolResult };
}

interface LoopOutcome {
  status: "done" | "paused" | "stopped";
  output?: string;
  tokensIn?: number;
  tokensOut?: number;
}

const APPROVAL_NOTE =
  `\n\nYou have tools available. Tools that message people or change outside systems ` +
  `require a human's approval: when you call one, your work pauses and you are resumed ` +
  `with the result once the human decides. Keep your final answer as plain text.`;

async function toolLoop(args: LoopArgs): Promise<LoopOutcome> {
  const { runId, node, spec, tools } = args;
  const history = args.history;
  let tokensIn = 0;
  let tokensOut = 0;

  if (args.resume) {
    history.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: args.resume.toolCallId,
          content: JSON.stringify(args.resume.result),
        },
      ],
    });
  }

  for (let step = 0; step < spec.maxSteps; step++) {
    const status = await getRunStatus(runId);
    if (status !== "running") {
      await setNode(node.id, { status: "stopped", finishedAt: new Date() });
      return { status: "stopped" };
    }

    const msg = await complete({
      model: spec.model.model,
      system: spec.systemPrompt + (tools.length > 0 ? APPROVAL_NOTE : ""),
      messages: history,
      tools,
      maxTokens: args.maxTokens,
    });
    tokensIn += msg.usage.input_tokens;
    tokensOut += msg.usage.output_tokens;
    history.push({ role: "assistant", content: msg.content });

    const uses = toolUses(msg);
    if (uses.length === 0) {
      return { status: "done", output: messageText(msg), tokensIn, tokensOut };
    }

    for (const use of uses) {
      const tool = tools.find((t) => t.name === use.name);
      if (!tool) {
        history.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify({ ok: false, error: `Unknown tool: ${use.name}` }),
            },
          ],
        });
        continue;
      }
      const gate = await gateToolCall({
        runId,
        nodeId: node.id,
        agentId: node.parentAgentId,
        agentName: args.agentName,
        autonomy: spec.autonomy,
        tool,
        input: use.input,
        title: actionTitle(use.name, use.input),
      });
      if (gate.outcome === "stopped") {
        await setNode(node.id, { status: "stopped", finishedAt: new Date() });
        return { status: "stopped" };
      }
      if (gate.outcome === "paused") {
        // Persist the conversation; the decision endpoint resumes it.
        loopStates.set(node.id, { history });
        return { status: "paused" };
      }
      history.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(gate.result),
          },
        ],
      });
    }

    const stillRunning = await getRunStatus(runId);
    if (stillRunning !== "running") {
      await setNode(node.id, { status: "stopped", finishedAt: new Date() });
      return { status: "stopped" };
    }
  }

  return {
    status: "done",
    output: "(Stopped after the tool-step budget.)",
    tokensIn,
    tokensOut,
  };
}

/** TEST MODE loop: skip the model, directly request the first approval-required tool. */
async function testLoop(
  runId: string,
  node: TaskNodeRow,
  agent: { row: AgentRow; spec: AgentSpec },
  tools: ToolDefinition[],
): Promise<void> {
  const tool = tools.find((t) => t.requiresApproval);
  if (!tool) {
    await setNode(node.id, {
      status: "done",
      output: "TEST MODE: no approval-required tools available; nothing to do.",
      finishedAt: new Date(),
    });
    await emitEvent(runId, "node.status", { nodeId: node.id, name: node.name, status: "done" }, node.id);
    return;
  }
  const gate = await gateToolCall({
    runId,
    nodeId: node.id,
    agentId: node.parentAgentId,
    agentName: agent.row.name,
    autonomy: agent.spec.autonomy,
    tool,
    input: TEST_TOOL_INPUTS[tool.name] ?? {},
    title: actionTitle(tool.name, TEST_TOOL_INPUTS[tool.name] ?? {}),
  });
  if (gate.outcome === "stopped") {
    await setNode(node.id, { status: "stopped", finishedAt: new Date() });
    return;
  }
  if (gate.outcome === "paused") {
    // The node stays in awaiting_approval; the decision endpoint resumes it.
    return;
  }
  await setNode(node.id, {
    status: "done",
    output: `TEST MODE: tool ${tool.name} executed: ${JSON.stringify(gate.result)}`,
    finishedAt: new Date(),
  });
  await emitEvent(runId, "node.status", { nodeId: node.id, name: node.name, status: "done" }, node.id);
}

/**
 * Resume a node paused in awaiting_approval after a human decision.
 * `toolCallId` identifies the paused tool_use block; in TEST MODE it is
 * `test_<nodeId>` and the loop simply completes.
 */
export async function resumeNodeLoop(
  runId: string,
  nodeId: string,
  toolCallId: string,
  result: ToolResult,
  maxTokens: number,
): Promise<void> {
  const nodeRows = await db.select().from(schema.taskNodes).where(eq(schema.taskNodes.id, nodeId)).limit(1);
  const node = nodeRows[0];
  if (!node) return;
  const agent = await loadAgent(node.parentAgentId);
  if (!agent) return;

  await setNode(nodeId, { status: "running" });
  await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "running" }, nodeId);

  if (TEST_LOOP) {
    await setNode(nodeId, {
      status: "done",
      output: `TEST MODE: resumed after human decision: ${JSON.stringify(result)}`,
      finishedAt: new Date(),
    });
    await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "done" }, nodeId);
    loopStates.delete(nodeId);
    return;
  }

  const state = loopStates.get(nodeId);
  if (!state) {
    await setNode(nodeId, {
      status: "failed",
      errorCode: "resume-lost",
      output: "The paused tool loop's conversation was lost (server restarted).",
      finishedAt: new Date(),
    });
    await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "failed" }, nodeId);
    return;
  }

  const tools = getToolsForSpec(agent.spec);
  const outcome = await toolLoop({
    runId,
    node,
    agentName: agent.row.name,
    spec: agent.spec,
    tools,
    history: state.history,
    maxTokens,
    resume: { toolCallId, result },
  });
  loopStates.delete(nodeId);
  if (outcome.status === "done") {
    await setNode(nodeId, {
      status: "done",
      output: outcome.output ?? "",
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      finishedAt: new Date(),
    });
    await emitEvent(runId, "node.status", { nodeId, name: node.name, status: "done" }, nodeId);
  }
}

/** All runs except terminal ones are eligible for /stop. */
export async function activeRunIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(inArray(schema.runs.status, ["planning", "running"]));
  return rows.map((r) => r.id);
}

const SETTLING = new Set(["queued", "running", "awaiting_approval"]);

/**
 * Wait until every sub node settles (done/failed/stopped) — nodes paused in
 * awaiting_approval resume via the decision endpoint, so the run must not race
 * ahead to synthesis. Gives up after 30 minutes of waiting.
 */
async function waitForNodes(runId: string, nodeIds: string[]): Promise<TaskNodeRow[]> {
  const deadline = Date.now() + 30 * 60 * 1000;
  for (;;) {
    const nodes = await db
      .select()
      .from(schema.taskNodes)
      .where(and(eq(schema.taskNodes.runId, runId), inArray(schema.taskNodes.id, nodeIds)));
    if (!nodes.some((n) => SETTLING.has(n.status))) return nodes;
    if ((await getRunStatus(runId)) !== "running") return nodes;
    if (Date.now() > deadline) {
      await failRun(runId, "Timed out waiting for pending approvals");
      return nodes;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
