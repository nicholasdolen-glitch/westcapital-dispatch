import type { Autonomy } from "./types";

/**
 * AgentSpec — the config format that makes agents portable.
 * A new business or platform means a new spec (+ a connector adapter), never a code fork.
 * The zod twin of this interface is `agentSpecSchema` in src/server/validation.ts;
 * keep the two in sync.
 */
export type ConnectorPlatform = "bonzo" | "follow_up_boss" | "monday" | "arive";

export interface SpecConnector {
  platform: ConnectorPlatform;
  permissions: "read" | "write";
}

export type SpecTrigger =
  | { type: "manual" }
  | { type: "schedule"; cron: string }
  | { type: "webhook"; platform: string; event: string };

export interface AgentSpec {
  model: { provider: "anthropic"; model: string };
  systemPrompt: string; // max 4000 chars (enforced by zod)
  connectors: SpecConnector[];
  autonomy: Autonomy; // "draft" | "supervised" | "autonomous"
  triggers: SpecTrigger[];
  maxSteps: number; // tool-loop budget per node, 1..40
}

export const DEFAULT_MODEL = "claude-opus-4-6";
export const DEFAULT_MAX_STEPS = 12;

export function defaultSpec(
  name: string,
  role: string,
  specialty: string,
  overrides: Partial<AgentSpec> = {},
): AgentSpec {
  return {
    model: { provider: "anthropic", model: DEFAULT_MODEL },
    systemPrompt:
      `You are ${name}, a ${role} on an AI team. ${specialty}. ` +
      `Do the task thoroughly and report back with a clear, complete answer. ` +
      `If you have tools available, use them when they help; tools that message people or ` +
      `change outside systems need a human's approval first, so request them and continue when the result comes back.`,
    connectors: [],
    autonomy: "draft",
    triggers: [{ type: "manual" }],
    maxSteps: DEFAULT_MAX_STEPS,
    ...overrides,
  };
}

/** Parse a stored spec JSON string; fall back to a safe default on any problem. */
export function parseSpec(json: string, name = "teammate", role = "agent", specialty = ""): AgentSpec {
  try {
    const raw = JSON.parse(json) as Partial<AgentSpec>;
    if (raw && typeof raw === "object" && raw.model && raw.systemPrompt) {
      return {
        model: {
          provider: "anthropic",
          model: typeof raw.model.model === "string" ? raw.model.model : DEFAULT_MODEL,
        },
        systemPrompt: String(raw.systemPrompt).slice(0, 4000),
        connectors: Array.isArray(raw.connectors) ? raw.connectors : [],
        autonomy:
          raw.autonomy === "supervised" || raw.autonomy === "autonomous" ? raw.autonomy : "draft",
        triggers: Array.isArray(raw.triggers) && raw.triggers.length > 0
          ? raw.triggers
          : [{ type: "manual" }],
        maxSteps:
          typeof raw.maxSteps === "number"
            ? Math.min(40, Math.max(1, Math.floor(raw.maxSteps)))
            : DEFAULT_MAX_STEPS,
      };
    }
  } catch {
    /* fall through to default */
  }
  return defaultSpec(name, role, specialty);
}
