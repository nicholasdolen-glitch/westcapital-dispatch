import { z } from "zod";
import type { Connector } from "./types";

/**
 * M2 TEST SCAFFOLDING — NOT a real connector.
 * Exposes a single `requiresApproval` tool (`send_test_message`) so the approval
 * gate, the pause/resume flow, and the kill switch can be verified end-to-end
 * without real platform credentials. Registered only when the
 * DISPATCH_TEST_STUB=1 env var is set (see registry.ts). M3 replaces this with
 * real platform adapters; until then this file must stay unregistered by default.
 */
export function stubConnector(): Connector {
  return {
    platform: "bonzo",
    tools: () => [
      {
        name: "send_test_message",
        description:
          "TEST ONLY: pretend to send a text message. Side-effecting, so it needs human approval.",
        inputSchema: z.object({
          to: z.string().trim().min(1).max(40),
          text: z.string().trim().min(1).max(500),
        }),
        requiresApproval: true,
        execute: async (input) => {
          const { to, text } = input as { to: string; text: string };
          return {
            ok: true,
            data: { sent: true, to, text, stubbed: true, at: new Date().toISOString() },
          };
        },
      },
    ],
    status: async () => ({ ok: true, detail: "test stub (M2 scaffolding)" }),
  };
}
