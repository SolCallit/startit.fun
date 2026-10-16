import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, Container, EmptyState, Mono, PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listMyApplications } from "@/lib/applications/data";

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
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
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
  );
}
