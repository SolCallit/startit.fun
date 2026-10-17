import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { listMyApplications, EDITABLE } from "@/lib/applications/data";
import { listPublicProjects } from "@/lib/data/public";
import { STATUS_LABEL } from "@/lib/domain/status";
import { ButtonLink } from "@/components/ui";
import { LaunchPathCard, ProjectCard } from "./cards";

export const metadata: Metadata = { title: "Home" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "token", label: "Tokens" },
  { key: "project", label: "Projects" },
  { key: "person", label: "People" },
  { key: "none", label: "Unpaired" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default function HomePage({ searchParams }: PageProps<"/home">) {
  return (
    <>
      <header className="sticky top-0 z-10 hidden h-16 items-center border-b border-line bg-paper/90 px-6 backdrop-blur lg:flex">
        <h1 className="text-[1.375rem]">Home</h1>
      </header>
      <div className="grid gap-7 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Suspense fallback={<div className="h-[22rem] rounded-[22px] border border-line bg-surface" />}>
            <LaunchPath />
          </Suspense>
          <Suspense fallback={<p className="text-muted">Loading projects…</p>}>
            <Projects searchParams={searchParams} />
          </Suspense>
        </div>
        <aside className="flex flex-col gap-5 xl:sticky xl:top-22 xl:self-start">
          <Suspense fallback={<div className="h-40 rounded-[18px] border border-line bg-surface" />}>
            <MyApplications />
          </Suspense>
          <FeeCard />
        </aside>
      </div>
    </>
  );
}

async function LaunchPath() {
  const user = await requireUser("/home");
  const mine = await listMyApplications(user.id);
  const draft = mine.find((a) => EDITABLE.includes(a.status));
  return <LaunchPathCard draft={draft ? { id: draft.id, name: draft.project_name } : null} />;
}

async function Projects({ searchParams }: { searchParams: PageProps<"/home">["searchParams"] }) {
  const sp = await searchParams;
  const raw = typeof sp.pair === "string" ? sp.pair : "all";
  const filter: FilterKey = FILTERS.some((f) => f.key === raw) ? (raw as FilterKey) : "all";
  const res = await listPublicProjects();
  const all = res.connected ? res.projects : [];
  const shown = all
    .filter((p) => (filter === "all" ? true : filter === "none" ? !p.pair_kind : p.pair_kind === filter))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  return (
    <section aria-labelledby="projects-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-title" className="text-[1.5rem]">Projects</h2>
        <Link href="/explore" className="text-[0.9375rem] font-semibold text-cobalt hover:underline">See all</Link>
      </div>
      <nav aria-label="Filter by pairing" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[0.9375rem] text-muted">Paired with</span>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/home" : `/home?pair=${f.key}`}
            aria-current={filter === f.key ? "true" : undefined}
            className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-[0.9375rem] font-semibold ${
              filter === f.key ? "border-cobalt bg-cobalt-soft text-ink" : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-display text-[1.25rem] font-extrabold text-ink">
            {all.length === 0 ? "No projects are live yet" : "No projects match this filter"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-ink-soft">
            {all.length === 0
              ? "Approved startups appear here with their verification report, token details and fee records. Yours could be first."
              : "Try another pairing, or see every project."}
          </p>
          <div className="mt-6 flex justify-center">
            {all.length === 0 ? <ButtonLink href="/apply">Apply to launch</ButtonLink> : <ButtonLink href="/home" intent="neutral">Show all</ButtonLink>}
          </div>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.map((p) => <ProjectCard key={p.public_ref} p={p} />)}
        </ul>
      )}
    </section>
  );
}

async function MyApplications() {
  const user = await requireUser("/home");
  const mine = await listMyApplications(user.id);
  return (
    <section aria-labelledby="mine-title" className="rounded-[18px] border border-line bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="mine-title" className="text-[1.125rem]">Your applications</h2>
        {mine.length ? <Link href="/dashboard" className="text-[0.875rem] font-semibold text-cobalt hover:underline">All</Link> : null}
      </div>
      {mine.length === 0 ? (
        <p className="text-[0.9375rem] text-ink-soft">
          None yet. An application takes about 15 minutes, and you can save a draft at any step.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {mine.slice(0, 5).map((a) => (
            <li key={a.id}>
              <Link href={EDITABLE.includes(a.status) ? `/applications/${a.id}/edit` : `/applications/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-cobalt">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{a.project_name ?? "Untitled application"}</span>
                  <span className="block text-[0.8125rem] text-muted">{STATUS_LABEL[a.status]}</span>
                </span>
                <span className="font-mono text-[0.8125rem] text-muted">{a.ticker ? `$${a.ticker}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeeCard() {
  return (
    <section aria-labelledby="fees-title" className="rounded-[18px] border border-line bg-surface p-5">
      <h2 id="fees-title" className="text-[1.125rem]">Found a startup worth launching?</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        You can apply for a project you don&apos;t run, with the founder&apos;s written approval. Launchers earn 5% of collected
        trading fees, paid out of the platform&apos;s share.
      </p>
      <Link href="/fees" className="mt-3 inline-block text-[0.9375rem] font-semibold text-cobalt hover:underline">See every fee record</Link>
    </section>
  );
}
