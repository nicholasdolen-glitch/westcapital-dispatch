import type { AgentSpec } from "@/lib/agentSpec";
import type { Connector, ToolDefinition } from "./types";
import { stubConnector } from "./stub";

/**
 * Connector registry. M2 returns an empty tool list: no real platform adapters
 * exist yet (M3). The one exception is the M2 test stub, registered only when
 * DISPATCH_TEST_STUB=1 so the approval gate can be verified end-to-end.
 *
 * Permission rule: a tool is offered to the model only if the agent's spec
 * grants the platform a `write` permission. Read-permission connectors never
 * expose `requiresApproval` tools.
 */
export function getConnectorsForSpec(spec: AgentSpec): Connector[] {
  if (process.env.DISPATCH_TEST_STUB !== "1") return [];
  const wanted = new Set(
    spec.connectors.filter((c) => c.permissions === "write").map((c) => c.platform),
  );
  const stub = stubConnector();
  return wanted.has(stub.platform) ? [stub] : [];
}

export function getToolsForSpec(spec: AgentSpec): ToolDefinition[] {
  return getConnectorsForSpec(spec).flatMap((c) => c.tools());
}

export function findToolForSpec(spec: AgentSpec, name: string): ToolDefinition | null {
  return getToolsForSpec(spec).find((t) => t.name === name) ?? null;
}
