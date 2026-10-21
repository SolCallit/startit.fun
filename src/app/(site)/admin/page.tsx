import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, EmptyState, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getDashboardCounts, getQueue, type QueueRow } from "@/lib/review/data";
import type { ApplicationStatus } from "@/lib/domain/status";

export const metadata: Metadata = { title: "Admin" };

/** What the admin does next for each status, and where that happens. */
const NEXT: Partial<Record<ApplicationStatus, { label: string; to: "review" | "launch" }>> = {
  submitted: { label: "Review it", to: "review" },
  awaiting_review: { label: "Review it", to: "review" },
  approved: { label: "Start launch setup", to: "review" },
  launch_config_pending: { label: "Set up launch", to: "launch" },
  ready_for_deployment: { label: "Launch it", to: "launch" },
};

const TABS = [
  { key: "todo", label: "To do", statuses: ["submitted", "awaiting_review", "approved", "launch_config_pending", "ready_for_deployment"] },
  { key: "waiting", label: "Waiting", statuses: ["ai_screening", "evidence_requested"] },
  { key: "live", label: "Live", statuses: ["launched"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "suspended"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ApplicationStatus[] }[];

export default function Admin(props: PageProps<"/admin">) {
  return (
    <Container className="py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[2rem] text-ink">Admin</h1>
        <div className="flex gap-2">
          <Link href="/admin/payouts" className="btn-chrome">Payouts</Link>
          <Link href="/admin/settings" className="btn-chrome">Settings</Link>
        </div>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Board {...props} />
      </Suspense>
    </Container>
  );
}

async function Board({ searchParams }: PageProps<"/admin">) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const [all, c] = await Promise.all([getQueue(TABS.flatMap((t) => [...t.statuses])), getDashboardCounts()]);
  const count = (k: (typeof TABS)[number]) => all.filter((r) => (k.statuses as readonly string[]).includes(r.status)).length;
  const rows = all.filter((r) => (tab.statuses as readonly string[]).includes(r.status));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Applications" className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const on = t.key === tab.key, n = count(t);
          return (
            <Link key={t.key} href={t.key === "todo" ? "/admin" : `/admin?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-[0.9375rem] font-semibold ${on ? "bg-start text-start-ink" : "glass text-ink-soft hover:text-ink"}`}>
              {t.label}
              <span className={`grid min-w-6 place-items-center rounded-full px-1.5 text-[0.75rem] ${on ? "bg-white/25" : t.key === "todo" && n ? "bg-start text-start-ink" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => <Row key={r.id} r={r} />)}
        </ul>
      ) : (
        <EmptyState title={tab.key === "todo" ? "Nothing to do" : `Nothing ${tab.label.toLowerCase()}`}>
          {tab.key === "todo" ? "New applications show up here as soon as they're submitted." : null}
        </EmptyState>
      )}

      <p className="text-[0.875rem] text-muted">
        {c.live} live · {c.pendingPayouts} payouts pending{c.failedPayouts ? ` · ${c.failedPayouts} payouts failed` : ""} · {c.total} applications in total
      </p>
    </div>
  );
}

function Row({ r }: { r: QueueRow }) {
  const next = NEXT[r.status];
  const href = next?.to === "launch" ? `/admin/applications/${r.id}/launch` : `/admin/applications/${r.id}`;
  return (
    <li className="glass flex flex-col gap-3 rounded-[18px] p-4 sm:flex-row sm:items-center">
      <Link href={`/admin/applications/${r.id}`} className="min-w-0 flex-1">
        <p className="truncate font-display text-[1.125rem] font-extrabold text-ink">
          {r.project_name ?? "Untitled"} {r.ticker ? <span className="font-semibold text-muted">${r.ticker}</span> : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
          <StatusBadge status={r.status} />
          {r.submitted_at ? <span>Sent {new Date(r.submitted_at).toLocaleDateString()}</span> : null}
          {r.flagged_count > 0 ? <span className="font-semibold text-flagged">{r.flagged_count} red flags</span> : null}
          {r.latest_run_status === "failed" ? <span className="text-flagged">AI check failed</span> : null}
        </p>
      </Link>
      {next ? <Link href={href} className="btn-start self-start sm:self-auto">{next.label}</Link> : <Link href={href} className="btn-chrome self-start sm:self-auto">Open</Link>}
    </li>
  );
}
