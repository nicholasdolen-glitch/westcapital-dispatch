"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HUES } from "@/lib/types";

/**
 * One dialog instance lives on the command center; any button rendered
 * through AddAgentButton opens it via a DOM event, and the sidebar's
 * "New teammate" link deep-links with ?add=teammate.
 */
const OPEN_EVENT = "dispatch:add-agent";

export function AddAgentButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => document.dispatchEvent(new CustomEvent(OPEN_EVENT))}
    >
      {children}
    </button>
  );
}

export function AddAgentDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const params = useSearchParams();
  const [hue, setHue] = useState<number>(HUES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const open = () => ref.current?.showModal();
    document.addEventListener(OPEN_EVENT, open);
    if (params.get("add") === "teammate") {
      ref.current?.showModal();
      router.replace("/", { scroll: false });
    }
    return () => document.removeEventListener(OPEN_EVENT, open);
  }, [params, router]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          role: String(fd.get("role") ?? ""),
          specialty: String(fd.get("specialty") ?? ""),
          hue,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't add the teammate. Check the fields and try again.");
      }
      form.reset();
      ref.current?.close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref}>
      <form onSubmit={submit}>
        <h3>New teammate</h3>
        <label>
          Name
          <input name="name" required maxLength={24} placeholder="Maya" />
        </label>
        <label>
          Role
          <input name="role" required maxLength={32} placeholder="Security analyst" />
        </label>
        <label>
          Specialty — what should the orchestrator send them?
          <input
            name="specialty"
            required
            maxLength={90}
            placeholder="Threat models, auth design, and risk review"
          />
        </label>
        <label>
          Color
          <div className="hue-picks">
            {HUES.map((h) => (
              <button
                key={h}
                type="button"
                className="hue-pick"
                aria-pressed={h === hue}
                aria-label={`hue ${h}`}
                style={{ background: `hsl(${h} 70% 55%)` }}
                onClick={() => setHue(h)}
              />
            ))}
          </div>
        </label>
        {error && <div className="form-err" role="alert">{error}</div>}
        <div className="dlg-row">
          <button type="button" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button className="run-btn" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add teammate"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
