"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AgentDTO } from "@/lib/types";
import type { TileCounts } from "@/server/queries";
import { PendingBadge } from "@/components/approvals/PendingBadge";

const NAV = [
  {
    href: "/",
    label: "Command center",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
        <rect x="11" y="11" width="6.5" height="6.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/runs",
    label: "Live runs",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 5.5V10l3 2" />
      </svg>
    ),
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="4.5" cy="10" r="2" />
        <circle cx="15.5" cy="4.5" r="2" />
        <circle cx="15.5" cy="15.5" r="2" />
        <path d="M6.4 9.2 13.6 5.4M6.4 10.8l7.2 3.8" />
      </svg>
    ),
  },
  {
    href: "/activity",
    label: "Activity",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2.5 10h3l2-5 4 10 2-5h4" />
      </svg>
    ),
  },
  {
    href: "/approvals",
    label: "Approvals",
    badge: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M10 2.5 17 6v5c0 4.5-3 7.2-7 8.5-4-1.3-7-4-7-8.5V6l7-3.5Z" />
        <path d="m7.5 10 1.8 1.8L12.8 8" />
      </svg>
    ),
  },
];

export function Shell({
  agents,
  counts,
  runningAgentIds,
  children,
}: {
  agents: AgentDTO[];
  counts: TileCounts;
  runningAgentIds: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Navigation">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="2" />
            <circle cx="16" cy="16" r="4" fill="var(--accent)" />
            <circle cx="27" cy="10" r="2.6" fill="var(--running)" />
            <path d="M19.5 13 25 11" stroke="var(--accent)" strokeWidth="1.6" />
          </svg>
          <div>
            <div className="brand-name">Dispatch</div>
            <div className="brand-tag">your AI team</div>
          </div>
        </div>

        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`nav-btn${pathname === n.href ? " active" : ""}`}
            onClick={close}
          >
            {n.icon}
            {n.label}
            {"badge" in n && n.badge ? <PendingBadge /> : null}
          </Link>
        ))}

        <div className="nav-sec">Team</div>
        {agents.map((a) => (
          <Link
            key={a.id}
            href={`/agents/${a.id}`}
            className={`nav-btn${pathname === `/agents/${a.id}` ? " active" : ""}`}
            onClick={close}
          >
            <span
              className="nav-agent-dot"
              style={{
                background: runningAgentIds.includes(a.id)
                  ? "var(--running)"
                  : `hsl(${a.hue} 70% 55%)`,
              }}
            />
            {a.name}
          </Link>
        ))}

        <Link href="/?add=teammate" className="nav-btn" onClick={close}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M10 4v12M4 10h12" />
          </svg>
          New teammate
        </Link>

        <div className="side-foot">All systems ready</div>
      </aside>
      <div className={`scrim${open ? " show" : ""}`} onClick={close} />

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}>
            ☰
          </button>
          <div className="tiles">
            <div className="tile t-run">
              <div className="val">{counts.running}</div>
              <div className="lbl">Running tasks</div>
            </div>
            <div className="tile">
              <div className="val">{counts.queued}</div>
              <div className="lbl">Queued</div>
            </div>
            <div className="tile t-done">
              <div className="val">{counts.done}</div>
              <div className="lbl">Completed</div>
            </div>
            <div className="tile">
              <div className="val">{counts.agents}</div>
              <div className="lbl">Teammates online</div>
            </div>
            <div className="tile">
              <div className="val">{counts.workflows}</div>
              <div className="lbl">Workflows</div>
            </div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
