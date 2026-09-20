import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell/Shell";
import { listAgents, tileCounts, agentStats } from "@/server/queries";

export const metadata: Metadata = {
  title: "Dispatch — agent command center",
  description: "Dispatch missions to your AI team and watch them work.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [agents, counts, stats] = await Promise.all([listAgents(), tileCounts(), agentStats()]);
  const runningAgentIds = agents
    .filter((a) => (stats.get(a.id)?.activeNow ?? 0) > 0)
    .map((a) => a.id);

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <Shell agents={agents} counts={counts} runningAgentIds={runningAgentIds}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
