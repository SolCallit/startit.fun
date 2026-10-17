import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, Container, EmptyState, Mono, PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listMyApplications } from "@/lib/applications/data";
import { getPublicFees } from "@/lib/data/public";
import { sol } from "@/components/fee-records";

export const metadata: Metadata = { title: "My applications" };

export default function Dashboard() {
  return (
    <Container className="py-14">
      <PageHeader title="My applications" actions={<ButtonLink href="/apply">New application</ButtonLink>} />
      <Suspense fallback={<p className="text-muted">Loading your applications…</p>}>
        <Applications />
      </Suspense>
    </Container>
  );
}

async function Applications() {
  const user = await requireUser("/dashboard");
  const apps = await listMyApplications(user.id);
  if (apps.length === 0) {
    return (
      <EmptyState title="You haven't started an application" action={<ButtonLink href="/apply">Start an application</ButtonLink>}>
        Applications you start are saved here as drafts until you submit them.
      </EmptyState>
    );
  }
  const launched = apps.filter((a) => a.status === "launched" && a.applicant_is_founder === false);
  return (
    <div className="flex flex-col gap-10">
    {launched.length ? <LauncherRewards refs={launched.map((a) => a.public_ref)} /> : null}
    <ul className="divide-y divide-line rounded-[18px] glass">
      {apps.map((a) => (
        <li key={a.id}>
          <Link href={a.status === "draft" ? `/applications/${a.id}/edit?step=1` : `/applications/${a.id}`}
            className="grid gap-2 px-5 py-4 hover:bg-paper sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="font-semibold text-ink">
                {a.project_name ?? "Untitled application"} {a.ticker ? <span className="font-medium text-muted">${a.ticker}</span> : null}
              </p>
              <p className="text-[0.875rem] text-muted"><Mono>{a.public_ref}</Mono> · updated {new Date(a.updated_at).toLocaleDateString()}</p>
            </div>
            <StatusBadge status={a.status} />
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}

/** What a launcher has earned: their 5% share, from the public payout records. */
async function LauncherRewards({ refs }: { refs: string[] }) {
  const all = await Promise.all(refs.map((r) => getPublicFees(r)));
  const payouts = all.flatMap((r) => (r.connected ? r.payouts : [])).filter((p) => p.recipient === "launcher");
  const total = (st: string[]) => payouts.filter((p) => st.includes(p.status)).reduce((a, p) => a + BigInt(p.amount_raw), BigInt(0));
  return (
    <section className="rounded-[18px] glass p-5">
      <h2 className="font-semibold text-ink">Launcher rewards</h2>
      <p className="mt-1 text-[0.9375rem] text-ink-soft">Your 5% of trading fees collected on projects you launched. Paid automatically from the Fee Router multisig.</p>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <div><dt className="text-[0.8125rem] text-muted">Paid</dt><dd className="text-[1.25rem] font-bold text-ink">{sol(total(["confirmed"]))}</dd></div>
        <div><dt className="text-[0.8125rem] text-muted">On the way</dt><dd className="text-[1.25rem] font-bold text-ink">{sol(total(["pending", "submitted"]))}</dd></div>
        <div><dt className="text-[0.8125rem] text-muted">Projects</dt><dd className="text-[1.25rem] font-bold text-ink">{refs.length}</dd></div>
      </dl>
    </section>
  );
}
