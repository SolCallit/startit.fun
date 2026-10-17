import { STATUS_LABEL, TIMELINE, type ApplicationStatus } from "@/lib/domain/status";

type Transition = { to_status: ApplicationStatus; created_at: string; reason: string | null };

/** The happy path, with off-path states (evidence requested, rejected, suspended) shown where they happened. */
export function StatusTimeline({ status, transitions }: { status: ApplicationStatus; transitions: Transition[] }) {
  const reachedAt = new Map<ApplicationStatus, string>();
  for (const t of transitions) reachedAt.set(t.to_status, t.created_at);

  const offPath = status === "rejected" || status === "suspended" || status === "evidence_requested";
  const lastHappy = offPath
    ? [...transitions].reverse().find((t) => TIMELINE.includes(t.to_status))?.to_status ?? "draft"
    : status;
  const currentIdx = TIMELINE.indexOf(lastHappy);

  return (
    <ol className="flex flex-col">
      {TIMELINE.map((s, i) => {
        const done = i < currentIdx || (i === currentIdx && !offPath && s === "launched");
        const current = i === currentIdx && !offPath;
        const when = reachedAt.get(s);
        return (
          <li key={s} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5 last:pb-0">
            {i < TIMELINE.length - 1 ? (
              <span aria-hidden className={`absolute top-5 left-[0.5625rem] h-[calc(100%-1.25rem)] w-px ${i < currentIdx ? "bg-cobalt" : "bg-line-strong"}`} />
            ) : null}
            <span aria-hidden className={`mt-0.5 size-5 rounded-full border-2 ${
              done || i < currentIdx ? "border-cobalt bg-cobalt" : current ? "border-cobalt bg-surface" : "border-line-strong bg-surface"}`} />
            <div>
              <p className={current ? "font-semibold text-ink" : i < currentIdx ? "text-ink" : "text-muted"}>
                {STATUS_LABEL[s]}
                {current ? <span className="sr-only"> (current)</span> : null}
              </p>
              {when && i <= currentIdx ? <p className="text-[0.8125rem] text-muted">{new Date(when).toLocaleString()}</p> : null}
              {offPath && i === currentIdx ? (
                <p className={`mt-1 font-semibold ${status === "evidence_requested" ? "text-review" : "text-flagged"}`}>
                  Then: {STATUS_LABEL[status]}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
