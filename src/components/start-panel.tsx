import Link from "next/link";
import { Suspense } from "react";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";
import { Reveal } from "@/components/motion";
import { StartButton } from "@/components/start-button";
import { listPublicProjects } from "@/lib/data/public";
import { projectImageUrl } from "@/lib/project-image";

const STEPS = [
  { short: "Submit", detail: "Bring a product: site, GitHub and socials, plus proof the brand approves the coin, its name and branding." },
  { short: "Brand signs", detail: "The brand signs off on the coin, its supply and the fee split, by wallet, before anything goes on-chain." },
  { short: "AI check", detail: "Matches public sources to the application. Every finding has a source and a time. It can flag, never approve." },
  { short: "Review", detail: "A person confirms the brand really signed off, then approves, rejects or asks for more." },
  { short: "Live", detail: "The starter presses Launch: the coin and their starter's buy go live on Raydium in one transaction." },
];

const SPLIT = [
  { label: "community", bps: DEFAULT_SPLIT.communityBps, cls: "bg-[#2ee5ff]" },
  { label: "brand", bps: DEFAULT_SPLIT.founderBps, cls: "bg-[#ff9cf6]" },
  { label: "Startit", bps: DEFAULT_SPLIT.platformBps, cls: "bg-white/60" },
  { label: "starter", bps: DEFAULT_SPLIT.launcherBps, cls: "bg-[#d8ff3c]" },
];

/**
 * The hero board. Left: the pitch in a classic display face, the five steps and the START ignition.
 * Right: a raised inner card with the real launch queue (approved coins about to go live, then live ones).
 */
export function StartPanel({ href, label, hint, action, as: Tag = "h1" }: { href: string; label: string; hint: string; action?: () => Promise<void>; as?: "h1" | "h2" }) {
  return (
    <Reveal>
      <section aria-labelledby="start-title" className="ignite-board relative mx-auto grid max-w-5xl gap-4 overflow-hidden p-4 sm:p-5 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-5">
        <div className="flex min-w-0 flex-col">
          <Tag id="start-title" className="font-classic hero-bold max-w-[16ch] text-[2rem] leading-[1.05] text-white sm:text-[2.6rem] lg:text-[3rem]">
            Meme power for undervalued brands.
          </Tag>
          <p className="mt-2.5 font-times text-[1rem] leading-snug text-white/75 sm:text-[1.125rem]">
            Back devs and artists. Trade their success.
          </p>
          <ol className="mt-3 flex flex-wrap gap-1.5 font-times text-[0.8125rem] text-white/80 sm:text-[0.875rem]">
            {STEPS.map((s, i) => (
              <li key={s.short} title={s.detail} className="whitespace-nowrap rounded-full bg-black/25 px-2.5 py-0.5 ring-1 ring-white/10">
                <span className="text-[#ff5a63]">{i + 1}</span> {s.short}
              </li>
            ))}
          </ol>

          <div className="mt-4 md:mt-auto md:pt-5">
            <StartButton compact href={href} label={label} hint={hint} action={action} />
          </div>

          <div className="mt-3 flex items-center gap-2.5 font-times text-[0.8125rem] text-white/65">
            <span className="flex h-1.5 w-14 shrink-0 overflow-hidden rounded-full" role="img" aria-label={SPLIT.map((s) => `${s.label} ${bpsToPercent(s.bps)}`).join(", ")}>
              {SPLIT.map((s) => <span key={s.label} className={s.cls} style={{ width: `${s.bps / 100}%` }} />)}
            </span>
            <span className="truncate">Fees: {SPLIT.map((s) => `${bpsToPercent(s.bps)} ${s.label}`).join(" · ")}</span>
          </div>
        </div>

        <aside aria-labelledby="queue-title" className="launch-queue flex min-w-0 flex-col rounded-[18px] p-3.5 sm:p-4">
          <div className="flex items-baseline justify-between gap-2 border-b border-white/15 pb-2">
            <h3 id="queue-title" className="font-classic font-normal tracking-normal text-[1.15rem] text-white sm:text-[1.3rem]">Upcoming launches</h3>
            <Link href="/explore" className="font-times text-[0.8125rem] text-white/60 hover:text-white">See all →</Link>
          </div>
          <Suspense fallback={<QueueSkeleton />}>
            <Queue />
          </Suspense>
        </aside>
      </section>
    </Reveal>
  );
}

const STAGE: Record<string, { text: string; dot: string }> = {
  approved: { text: "Upcoming", dot: "bg-[#ffd02e]" },
  launch_config_pending: { text: "Upcoming", dot: "bg-[#ffd02e]" },
  ready_for_deployment: { text: "Launching soon", dot: "bg-[#ff7a2e] animate-pulse" },
  launched: { text: "Live", dot: "bg-[#2fe66a]" },
};

async function Queue() {
  let rows: { ref: string; ticker: string; name: string; status: string; image: string | null }[] = [];
  try {
    const r = await listPublicProjects();
    if (r.connected) {
      const order = (s: string) => (s === "ready_for_deployment" ? 0 : s === "launched" ? 2 : 1);
      rows = r.projects
        .map((p) => ({ ref: p.public_ref, ticker: p.ticker, name: p.project_name, status: p.status, image: projectImageUrl(p.image_path) }))
        .sort((a, b) => order(a.status) - order(b.status))
        .slice(0, 5);
    }
  } catch { /* the board still renders without the queue */ }

  if (!rows.length) {
    return <p className="py-6 text-center font-times text-[0.9375rem] text-white/65">Approved coins line up here before they go live.</p>;
  }
  return (
    <ul className="mt-1 flex flex-col">
      {rows.map((r) => {
        const st = STAGE[r.status] ?? STAGE.approved!;
        return (
          <li key={r.ref}>
            <Link href={`/projects/${r.ref}`} className="group flex items-center gap-2.5 rounded-[10px] px-1.5 py-2 hover:bg-white/[0.06]">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image} alt="" width={30} height={30} className="size-[30px] shrink-0 rounded-[9px] object-cover" />
              ) : <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-white/10 text-[0.6875rem] font-bold text-white">{r.ticker.slice(0, 2)}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-times text-[1.0625rem] font-bold leading-tight text-white">${r.ticker}</span>
                <span className="block truncate font-times text-[0.75rem] text-white/55">{r.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-times text-[0.8125rem] text-white/80">
                <span className={`size-2 rounded-full ${st.dot}`} />{st.text}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function QueueSkeleton() {
  return (
    <ul className="mt-1 flex animate-pulse flex-col gap-2 py-1">
      {[0, 1, 2].map((i) => <li key={i} className="h-10 rounded-[10px] bg-white/[0.06]" />)}
    </ul>
  );
}
