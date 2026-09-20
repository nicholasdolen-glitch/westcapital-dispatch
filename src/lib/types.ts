export const RUN_STATUSES = ["planning", "running", "done", "failed", "stopped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const NODE_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "done",
  "failed",
  "stopped",
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const NODE_KINDS = ["lead", "sub", "synthesis"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const TIER_MODES = ["fast", "thorough"] as const;
export type TierMode = (typeof TIER_MODES)[number];

export const AGENT_STATUSES = ["active", "paused"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AUTONOMY_LEVELS = ["draft", "supervised", "autonomous"] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];

export const RUN_TRIGGERS = ["manual", "webhook", "schedule"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const RUN_KINDS = ["mission", "watcher"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const ACTION_STATUSES = ["pending", "approved", "rejected", "superseded"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Event types emitted into the per-run SSE stream (see src/server/engine/events.ts). */
export const EVENT_TYPES = [
  "run.created",
  "node.status",
  "node.awaiting_approval",
  "action.requested",
  "action.decided",
  "action.executed", // M2 extension: autonomous/supervised tool runs with no pending row
  "run.stopped", // M2 extension: kill switch or /stop halted the run
  "run.done",
  "run.failed",
] as const;

export const HAIR_STYLES = ["bob", "short", "spiky", "long", "wavy", "curly", "buzz"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

import type { AgentSpec } from "./agentSpec";

export interface FaceConfig {
  skin: string;
  hairColor: string;
  style: HairStyle;
  glasses?: boolean;
  beard?: boolean;
  earring?: boolean;
  headset?: boolean;
}

export interface AgentDTO {
  id: string;
  name: string;
  role: string;
  specialty: string;
  hue: number;
  face: FaceConfig;
  avatarUrl: string | null; // photo portrait URL, null = cartoon Emblem fallback
  isCore: boolean;
  spec: AgentSpec;
  status: AgentStatus;
}

export interface AgentStats {
  done: number;
  failed: number;
  totalMs: number; // summed duration of done nodes
  activeNow: number; // queued + running
}

export const LEAD_ID = "atlas";

/** Palette options for custom teammates — mirrors the prototype. */
export const SKINS = ["#F2D6B3", "#E8B98F", "#D9A066", "#B97F55", "#8D5A3B", "#6B4630"] as const;
export const HAIR_COLORS = ["#1E1A16", "#26180F", "#4A3226", "#7A3B1E", "#3A3F47", "#8A8F98"] as const;
export const HUES = [210, 175, 28, 262, 338, 135, 55, 0] as const;
