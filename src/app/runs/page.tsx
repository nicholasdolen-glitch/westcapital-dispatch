import Link from "next/link";
import { listRuns } from "@/server/queries";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function Runs() {
  const runs = await listRuns();

  return (
    <section>
      <div className="view-head">
        <h2>Live runs</h2>
        <span className="sub">Every mission, streaming as it happens.</span>
      </div>
      {runs.length === 0 ? (
        <div className="empty">
          <b>No runs yet</b>
          Dispatch a mission from the command center, or run a workflow.
        </div>
      ) : (
        <div>
          {runs.map((r) => (
            <Link key={r.id} href={`/runs/${r.id}`} className="run-row">
              <span className={`status`}>{r.status}</span>
              <span className="run-task">{r.task}</span>
              <span className="run-time">{fmt(r.startedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
