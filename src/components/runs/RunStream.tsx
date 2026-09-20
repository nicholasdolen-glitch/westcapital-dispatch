"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live-updates the run detail page from the run's SSE event stream.
 * Refreshes server data on every event (debounced); closes when the run ends.
 */
export function RunStream({ runId, initialTerminal }: { runId: string; initialTerminal: boolean }) {
  const router = useRouter();
  const [live, setLive] = useState(!initialTerminal);
  const [stopping, setStopping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialTerminal) return;
    const es = new EventSource(`/api/runs/${runId}/events?fromSeq=-1`);
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    es.onmessage = refresh;
    es.addEventListener("run.terminal", () => {
      setLive(false);
      es.close();
      router.refresh();
    });
    es.onerror = () => {
      // EventSource retries on its own; a terminal close stops it.
    };
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId, initialTerminal, router]);

  async function stop() {
    setStopping(true);
    try {
      await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
    } finally {
      setStopping(false);
      router.refresh();
    }
  }

  return (
    <div className="appr-actions" style={{ marginBottom: 14 }}>
      <span className="appr-meta">{live ? "Streaming live" : "Finished"}</span>
      {live && (
        <button className="btn danger" onClick={() => void stop()} disabled={stopping}>
          {stopping ? "Stopping…" : "Stop run"}
        </button>
      )}
    </div>
  );
}
