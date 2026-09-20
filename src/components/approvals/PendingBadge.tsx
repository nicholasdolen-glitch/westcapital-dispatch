"use client";

import { useEffect, useState } from "react";

/** Pending-approval count badge. Polls every 15s (SSE for global events is a later milestone). */
export function PendingBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/approvals?status=pending", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as unknown[];
        if (alive) setCount(data.length);
      } catch {
        /* sidebar stays quiet on failure */
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!count) return null;
  return <span className="nav-badge">{count}</span>;
}
