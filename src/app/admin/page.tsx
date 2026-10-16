import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container, EmptyState, Mono, PageHeader, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getDashboardCounts, getQueue, type QueueRow } from "@/lib/review/data";

export const metadata: Metadata = { title: "Review queue" };

export default function Admin() {
  return (
    <Container className="py-12">
      <PageHeader title="Review queue" lede="Applications waiting on a decision, and the state of every launch and payout." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Overview />
      </Suspense>
    </Container>
  );
}

const lamportsToSol = (v: bigint) => `${(Number(v) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`;

const REC_LABEL: Record<string, string> = {
  proceed_to_human_review: "AI: proceed to review",
  request_evidence: "AI: request evidence",
  recommend_rejection: "AI: recommends rejection",
};

async function Overview() {
  await requireStaff();
  const [c, awaiting, inFlight] = await Promise.all([
    getDashboardCounts(),
    getQueue(["awaiting_review"]),
    getQueue(["submitted", "ai_screening", "evidence_requested"]),
  ]);
  const nothingCollected = c.feesCollectedRaw === BigInt(0);

  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Stat label="Awaiting review" value={c.awaiting} emphasis={c.awaiting > 0} />
        <Stat label="Need attention" value={c.flaggedFindings} hint="Flagged findings or AI recommends rejection" emphasis={c.flaggedFindings > 0} tone="bad" />
        <Stat label="Approved, not configured" value={c.approved} />
        <Stat label="Launches pending" value={c.pendingLaunch} />
        <Stat label="Live launches" value={c.live} />
        <Stat label="Suspended" value={c.suspended} tone={c.suspended ? "bad" : undefined} />
        <Stat label="Payouts pending" value={c.pendingPayouts} />
        <Stat label="Payouts failed" value={c.failedPayouts} tone={c.failedPayouts ? "bad" : undefined} emphasis={c.failedPayouts > 0} />
      </section>

      <section aria-label="Fees" className="rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Trading fees</h2>
        {nothingCollected ? (
          <p className="mt-2 text-ink-soft">No fees have been collected yet. Figures appear here only from confirmed on-chain transactions.</p>
        ) : (
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div><dt className="text-[0.875rem] text-muted">Collected</dt><dd className="text-[1.25rem] font-bold text-ink">{lamportsToSol(c.feesCollectedRaw)}</dd></div>
            <div><dt className="text-[0.875rem] text-muted">Distributed</dt><dd className="text-[1.25rem] font-bold text-ink">{lamportsToSol(c.feesDistributedRaw)}</dd></div>
            <div><dt className="text-[0.875rem] text-muted">Platform share paid</dt><dd className="text-[1.25rem] font-bold text-ink">{lamportsToSol(c.platformFeesRaw)}</dd></div>
          </dl>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-[1.25rem] font-semibold text-ink">Waiting for a decision</h2>
        {awaiting.length ? <QueueTable rows={awaiting} /> : <EmptyState title="Nothing waiting for review">New applications appear here after AI screening finishes.</EmptyState>}
      </section>

      <section>
        <h2 className="mb-4 text-[1.25rem] font-semibold text-ink">In progress</h2>
        {inFlight.length ? <QueueTable rows={inFlight} /> : <p className="text-ink-soft">No applications are being screened or waiting on founders.</p>}
      </section>
      <p className="text-[0.875rem] text-muted">{c.total} applications submitted in total.</p>
    </div>
  );
}

function Stat({ label, value, hint, emphasis, tone }: { label: string; value: number; hint?: string; emphasis?: boolean; tone?: "bad" }) {
  return (
    <div className="bg-surface p-4">
      <p className={`text-[1.75rem] leading-none font-bold ${emphasis ? (tone === "bad" ? "text-flagged" : "text-cobalt") : "text-ink"}`}>{value}</p>
      <p className="mt-2 text-[0.875rem] font-medium text-ink-soft">{label}</p>
      {hint ? <p className="text-[0.75rem] text-muted">{hint}</p> : null}
    </div>
  );
}

function QueueTable({ rows }: { rows: QueueRow[] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/admin/applications/${r.id}`} className="grid gap-2 px-5 py-4 hover:bg-paper md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-semibold text-ink">{r.project_name ?? "Untitled"} {r.ticker ? <span className="font-medium text-muted">${r.ticker}</span> : null}</p>
              <p className="text-[0.875rem] text-muted">
                <Mono>{r.public_ref}</Mono>
                {r.submitted_at ? ` · submitted ${new Date(r.submitted_at).toLocaleDateString()}` : ""}
                {r.recommendation ? ` · ${REC_LABEL[r.recommendation] ?? r.recommendation}` : ""}
                {r.latest_run_status === "failed" ? " · last screening run failed" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.flagged_count > 0 ? <span className="rounded bg-flagged-soft px-2 py-0.5 text-[0.8125rem] font-semibold text-flagged">{r.flagged_count} flagged</span> : null}
              {r.needs_review_count > 0 ? <span className="rounded bg-review-soft px-2 py-0.5 text-[0.8125rem] font-semibold text-review">{r.needs_review_count} need review</span> : null}
              <StatusBadge status={r.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
