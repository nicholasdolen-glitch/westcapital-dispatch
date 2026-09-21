import { z } from "zod";
import {
  ACTION_STATUSES,
  AGENT_STATUSES,
  AUTONOMY_LEVELS,
  HAIR_STYLES,
  NODE_KINDS,
  NODE_STATUSES,
  RUN_KINDS,
  RUN_STATUSES,
  RUN_TRIGGERS,
  TIER_MODES,
} from "@/lib/types";

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "hex color");

export const autonomySchema = z.enum(AUTONOMY_LEVELS);
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export const runTriggerSchema = z.enum(RUN_TRIGGERS);
export const runKindSchema = z.enum(RUN_KINDS);
export const actionStatusSchema = z.enum(ACTION_STATUSES);

/**
 * AgentSpec zod schema — the API-boundary twin of the AgentSpec interface in
 * src/lib/agentSpec.ts. Keep the two in sync.
 */
export const agentSpecSchema = z.object({
  model: z.object({
    provider: z.literal("anthropic"),
    model: z.string().trim().min(1).max(80),
  }),
  systemPrompt: z.string().trim().min(1).max(4000),
  connectors: z
    .array(
      z.object({
        platform: z.enum(["bonzo", "follow_up_boss", "monday", "arive"]),
        permissions: z.enum(["read", "write"]),
      }),
    )
    .max(8),
  autonomy: autonomySchema,
  triggers: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("manual") }),
        z.object({ type: z.literal("schedule"), cron: z.string().trim().min(1).max(120) }),
        z.object({
          type: z.literal("webhook"),
          platform: z.string().trim().min(1).max(40),
          event: z.string().trim().min(1).max(80),
        }),
      ]),
    )
    .max(8),
  maxSteps: z.number().int().min(1).max(40),
});

export type AgentSpecInput = z.infer<typeof agentSpecSchema>;

export const faceSchema = z.object({
  skin: hex,
  hairColor: hex,
  style: z.enum(HAIR_STYLES),
  glasses: z.boolean().optional(),
  beard: z.boolean().optional(),
  earring: z.boolean().optional(),
  headset: z.boolean().optional(),
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(24),
  role: z.string().trim().min(1).max(32),
  specialty: z.string().trim().min(1).max(90),
  hue: z.number().int().min(0).max(359),
  face: faceSchema.optional(), // omitted → server randomizes
  spec: agentSpecSchema.optional(), // omitted → server builds the default
  status: agentStatusSchema.optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  role: z.string().trim().min(1).max(32).optional(),
  specialty: z.string().trim().min(1).max(90).optional(),
  hue: z.number().int().min(0).max(359).optional(),
  face: faceSchema.optional(),
  spec: agentSpecSchema.optional(),
  status: agentStatusSchema.optional(),
});

/** Export/import round-trip: the export payload is accepted back by /api/agents/import. */
export const importAgentSchema = z.object({
  name: z.string().trim().min(1).max(24),
  role: z.string().trim().min(1).max(32).default("Teammate"),
  specialty: z.string().trim().min(1).max(90).default("Imported teammate"),
  hue: z.number().int().min(0).max(359).default(210),
  face: faceSchema.optional(),
  spec: agentSpecSchema,
});

export const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  editedPayload: z.unknown().optional(),
  reason: z.string().trim().max(500).optional(),
});

export const settingsSchema = z.object({
  key: z.literal("kill_switch"),
  value: z.boolean(),
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(60),
  prompt: z.string().trim().min(1).max(4000),
  teamAgentIds: z.array(z.string().min(1)).max(12).nullable(),
});

export const dispatchSchema = z.object({
  task: z.string().trim().min(1).max(8000),
  teamAgentIds: z.array(z.string().min(1)).max(12).optional(),
  leadAgentId: z.string().min(1).optional(),
  tierMode: z.enum(TIER_MODES).default("fast"),
  workflowId: z.string().optional(),
});

/** The orchestrator's required JSON plan shape (used from milestone 2 on). */
export const planSchema = z.object({
  plan: z
    .array(
      z.object({
        agentId: z.string().min(1),
        subName: z.string().trim().min(1).max(40),
        role: z.string().trim().min(1).max(120),
        instructions: z.string().trim().min(1).max(1200),
      }),
    )
    .min(1)
    .max(8),
});

export const runStatusSchema = z.enum(RUN_STATUSES);
export const nodeStatusSchema = z.enum(NODE_STATUSES);
export const nodeKindSchema = z.enum(NODE_KINDS);

/** Chat message from Nick to a teammate. */
export const chatMessageSchema = z.object({
  content: z.string().trim().min(1, "Say something first.").max(8000),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type DispatchInput = z.infer<typeof dispatchSchema>;
export type Plan = z.infer<typeof planSchema>;
