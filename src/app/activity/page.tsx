import Link from "next/link";
import { recentEvents } from "@/server/queries";
import { eventText, eventTime } from "@/lib/eventText";

export const dynamic = "force-dynamic";

export default async function Activity() {
  const events = await recentEvents(60);
  return (
    <section>
      <div className="view-head">
        <h2>Activity</h2>
        <span className="sub">Everything that happened, newest first.</span>
      </div>
      <div className="feed">
        {events.length === 0 ? (
          <div className="feed-item">
            <span>Nothing yet.</span>
          </div>
        ) : (
          events.map((e) => {
            const inner = (
              <>
                <span className="feed-time">{eventTime(e)}</span>
                <span>{eventText(e)}</span>
              </>
            );
            return e.runId ? (
              <Link key={e.id} href={`/runs/${e.runId}`} className="feed-item">
                {inner}
              </Link>
            ) : (
              <div key={e.id} className="feed-item">
                {inner}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
