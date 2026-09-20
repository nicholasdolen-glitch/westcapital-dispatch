"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ApprovalItem {
  id: string;
  runId: string;
  nodeId: string | null;
  agentId: string;
  agentName: string;
  runTask: string;
  nodeName: string | null;
  kind: string;
  title: string;
  payload: unknown;
  status: string;
  createdAt: string;
}

export function ApprovalCards({ items }: { items: ApprovalItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "rejected", editedPayload?: unknown) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, editedPayload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function startEdit(item: ApprovalItem) {
    setEditing(item.id);
    setDraft(JSON.stringify(item.payload, null, 2));
    setError(null);
  }

  function approveEdited(item: ApprovalItem) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError("The edited payload isn't valid JSON.");
      return;
    }
    void decide(item.id, "approved", parsed);
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <b>Nothing waiting</b>
        When an agent wants to do something side-effecting, it lands here for your call.
      </div>
    );
  }

  return (
    <div>
      {items.map((a) => (
        <div key={a.id} className="appr-card">
          <div className="appr-top">
            <span className="appr-title">{a.title}</span>
          </div>
          <div className="appr-meta">
            {a.agentName} · {a.kind} · mission: {a.runTask.slice(0, 80)}
            {a.runTask.length > 80 ? "…" : ""}
            {a.nodeName ? ` · node: ${a.nodeName}` : ""}
          </div>
          {editing === a.id ? (
            <textarea
              className="appr-edit"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edited payload as JSON"
            />
          ) : (
            <div className="appr-payload">{JSON.stringify(a.payload, null, 2)}</div>
          )}
          <div className="appr-actions">
            {editing === a.id ? (
              <>
                <button
                  className="btn primary"
                  disabled={busy === a.id}
                  onClick={() => approveEdited(a)}
                >
                  Approve with edits
                </button>
                <button className="btn" disabled={busy === a.id} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn primary"
                  disabled={busy === a.id}
                  onClick={() => void decide(a.id, "approved")}
                >
                  Approve
                </button>
                <button className="btn" disabled={busy === a.id} onClick={() => startEdit(a)}>
                  Edit
                </button>
                <button
                  className="btn danger"
                  disabled={busy === a.id}
                  onClick={() => void decide(a.id, "rejected")}
                >
                  Reject
                </button>
              </>
            )}
          </div>
          {error && <div className="appr-err">{error}</div>}
        </div>
      ))}
    </div>
  );
}
