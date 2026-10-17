import Link from "next/link";
import type { PublicProject } from "@/lib/data/public";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";
import { PairBadge } from "@/components/pair-badge";
import { ButtonLink, StatusBadge } from "@/components/ui";

const PATH = [
  { who: "You", title: "Apply", detail: "Product, links, founder approval and the token idea." },
  { who: "AI agent", title: "Screening", detail: "Checks every claim against public sources." },
  { who: "Startit", title: "Human review", detail: "A person approves, rejects or asks for more." },
  { who: "Founder", title: "Signs terms", detail: "Supply, authorities and fee split, signed by wallet." },
  { who: "Startit", title: "Launch", detail: "Goes live on Raydium LaunchLab." },
];

const SPLIT = [
  { label: "Community", bps: DEFAULT_SPLIT.communityBps, cls: "bg-verified" },
  { label: "Founder", bps: DEFAULT_SPLIT.founderBps, cls: "bg-cobalt" },
  { label: "Platform", bps: DEFAULT_SPLIT.platformBps, cls: "bg-unverified" },
  { label: "Launcher", bps: DEFAULT_SPLIT.launcherBps, cls: "bg-review" },
];

/** The signature card: the actual route a launch takes, with the Apply action inside it. */
export function LaunchPathCard({ draft }: { draft: { id: string; name: string | null } | null }) {
  return (
    <section
      aria-labelledby="path-title"
      className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-6 shadow-raise sm:p-8"
    >
      {/* faint grid, like a chart under the route */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <h2 id="path-title" className="text-[2rem] leading-[1.05] sm:text-[2.5rem]">
              From real product to community token
            </h2>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-soft">
              Every launch takes the same route. Nothing goes on-chain until a person has reviewed it and the founder has signed.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {draft ? (
              <ButtonLink href={`/applications/${draft.id}/edit`}>Continue {draft.name ?? "your application"}</ButtonLink>
            ) : (
              <ButtonLink href="/apply">Apply to launch</ButtonLink>
            )}
            <ButtonLink href="/methodology" intent="neutral">How we verify</ButtonLink>
          </div>
        </div>

        <ol className="grid gap-5 sm:grid-cols-5 sm:gap-3">
          {PATH.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 sm:flex-col sm:gap-3">
              {/* connector */}
              {i < PATH.length - 1 ? (
                <span aria-hidden className="absolute top-10 left-[1.1875rem] h-[calc(100%-1rem)] border-l-2 border-dashed border-line-strong sm:top-[1.1875rem] sm:left-11 sm:h-0 sm:w-[calc(100%-2.5rem)] sm:border-t-2 sm:border-l-0" />
              ) : null}
              <span
                className={`relative z-[1] grid size-10 shrink-0 place-items-center rounded-full border-2 font-display text-[1.0625rem] font-extrabold ${
                  i === PATH.length - 1 ? "border-cobalt bg-cobalt text-cobalt-ink shadow-[0_0_0_6px_var(--cobalt-soft)]" : "border-line-strong bg-paper text-ink"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex flex-col gap-1 pb-1">
                <span className="text-[0.8125rem] font-semibold text-muted">{s.who}</span>
                <span className="font-display text-[1.125rem] font-extrabold leading-tight text-ink">{s.title}</span>
                <span className="text-[0.875rem] leading-snug text-ink-soft">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-paper/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-ink">Where trading fees go</p>
            <p className="text-[0.875rem] text-muted">Of fees actually collected, paid in SOL</p>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={SPLIT.map((s) => `${s.label} ${bpsToPercent(s.bps)}`).join(", ")}>
            {SPLIT.map((s) => <span key={s.label} className={s.cls} style={{ width: `${s.bps / 100}%` }} />)}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.875rem] text-ink-soft">
            {SPLIT.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span aria-hidden className={`size-2.5 rounded-full ${s.cls}`} />
                {s.label} <span className="font-semibold text-ink">{bpsToPercent(s.bps)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function ProjectCard({ p }: { p: PublicProject }) {
  return (
    <li>
      <Link
        href={`/projects/${p.public_ref}`}
        className="flex h-full flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 shadow-raise-sm hover:border-line-strong"
      >
        <div className="flex items-start gap-3">
          <TokenMark ticker={p.ticker} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[1.125rem] font-extrabold text-ink">{p.project_name}</p>
            <p className="font-mono text-[0.875rem] text-muted">${p.ticker}</p>
          </div>
        </div>
        <p className="line-clamp-2 text-[0.9375rem] leading-snug text-ink-soft">{p.project_summary}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <PairBadge pairing={p} />
          {p.network === "solana-devnet" ? <span className="rounded-full bg-review-soft px-2.5 py-0.5 text-[0.8125rem] font-semibold text-review">Devnet</span> : null}
        </div>
      </Link>
    </li>
  );
}


/** Monogram avatar with a stable hue per ticker — no network request, never a broken image. */
export function TokenMark({ ticker, size = 48 }: { ticker: string; size?: number }) {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: `linear-gradient(145deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 65% 38%))` }}
      className="grid shrink-0 place-items-center rounded-[14px] font-display text-[1.0625rem] font-extrabold text-white shadow-raise-sm"
    >
      {ticker.slice(0, 2)}
    </span>
  );
}
