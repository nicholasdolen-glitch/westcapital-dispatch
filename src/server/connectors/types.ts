import type { z } from "zod";
import type { ConnectorPlatform } from "@/lib/agentSpec";

/**
 * Connector tool interface — DEFINED in M2, IMPLEMENTED in M3.
 * Every platform adapter (Bonzo, Follow Up Boss, Monday, Arive) implements
 * `Connector`; the approval gate in src/server/engine/gate.ts is the only
 * caller of `execute`.
 */
export interface ActionContext {
  runId: string;
  nodeId: string;
  agentId: string;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

export interface ToolDefinition {
  name: string; // e.g. "send_message"
  description: string; // shown to the model
  /** Validated before execute AND before a human approves an edited payload. */
  inputSchema: z.ZodTypeAny;
  /** True for anything side-effecting. The approval gate pauses on these. */
  requiresApproval: boolean;
  execute: (input: unknown, ctx: ActionContext) => Promise<ToolResult>;
}

export interface Connector {
  platform: ConnectorPlatform;
  tools(): ToolDefinition[];
  status(): Promise<{ ok: boolean; detail?: string }>;
}
