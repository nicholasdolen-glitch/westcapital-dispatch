"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { TierMode } from "@/lib/types";

export function DispatchBar() {
  const [tier, setTier] = useState<TierMode>("fast");
  const [note, setNote] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function dispatch() {
    const task = inputRef.current?.value.trim() ?? "";
    if (!task || busy) return;
    setBusy(true);
    setNote(null);
    setRunId(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, tierMode: tier }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Dispatch failed");
      setRunId(data.id ?? null);
      setNote("Mission dispatched — Elena is planning it now.");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="command" aria-label="Dispatch a task">
      <textarea
        id="taskInput"
        ref={inputRef}
        placeholder="Describe a mission — Elena will split it across the team, and each teammate runs their part."
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void dispatch();
        }}
      />
      <div className="command-row">
        <button className="run-btn" onClick={() => void dispatch()} disabled={busy}>
          {busy ? "Dispatching…" : "Dispatch"}
        </button>
        <div className="tierbox" role="group" aria-label="Speed">
          <button aria-pressed={tier === "fast"} onClick={() => setTier("fast")}>
            Fast
          </button>
          <button aria-pressed={tier === "thorough"} onClick={() => setTier("thorough")}>
            Thorough
          </button>
        </div>
      </div>
      {note && (
        <div className="command-note">
          {note}{" "}
          {runId && (
            <Link href={`/runs/${runId}`}>
              Watch it live
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
