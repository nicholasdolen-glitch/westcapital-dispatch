"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RemoveAgentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Remove ${name} from the team? Their past task records stay in the run history.`))
      return;
    setBusy(true);
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button className="stop-btn" onClick={remove} disabled={busy}>
      {busy ? "Removing…" : "Remove teammate"}
    </button>
  );
}
