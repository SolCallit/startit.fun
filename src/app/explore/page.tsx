import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, Container, EmptyState, Mono, PageHeader, StatusBadge } from "@/components/ui";
import { listPublicProjects } from "@/lib/data/public";

export const metadata: Metadata = { title: "Projects" };

export default function Explore() {
  return (
    <Container className="py-14">
      <PageHeader
        title="Approved projects"
        lede="Startups that passed screening and human review, with their verification reports, token details and fee records."
      />
      <Suspense fallback={<p className="text-muted">Loading projects…</p>}>
        <ProjectList />
      </Suspense>
    </Container>
  );
}

async function ProjectList() {
  const result = await listPublicProjects();
  if (!result.connected) {
    return (
      <EmptyState title="The project directory isn't connected yet">
        Approved projects will appear here once the Startit database is live.
      </EmptyState>
    );
  }
  if (result.projects.length === 0) {
    return (
      <EmptyState title="No projects have been approved yet" action={<ButtonLink href="/apply">Apply to launch</ButtonLink>}>
        The first approved startups will be listed here with their full verification reports.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {result.projects.map((p) => (
        <li key={p.public_ref}>
          <Link href={`/projects/${p.public_ref}`} className="grid gap-2 px-5 py-4 hover:bg-paper sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[1.0625rem] font-semibold text-ink">
                {p.project_name} <span className="font-medium text-muted">${p.ticker}</span>
              </p>
              <p className="mt-0.5 line-clamp-1 text-ink-soft">{p.project_summary}</p>
            </div>
            <div className="flex items-center gap-3">
              {p.mint_address ? <Mono className="text-muted">{p.mint_address.slice(0, 4)}…{p.mint_address.slice(-4)}</Mono> : null}
              <StatusBadge status={p.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
