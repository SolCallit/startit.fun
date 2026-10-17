import Link from "next/link";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";
import { Reveal } from "@/components/motion";
import { StartButton } from "@/components/start-button";

const STEPS = [
  { who: "You, or anyone who backs the product", title: "Bring a product", short: "Bring a product", detail: "Site, GitHub and socials, plus proof the builder approves the coin, its name and branding." },
  { who: "AI agent", title: "Checks the receipts", short: "AI checks receipts", detail: "Matches public sources to the application. Every finding has a source and a time. It can flag, never approve." },
  { who: "Startit team", title: "Human review", short: "Human review", detail: "Confirms the builder really signed off, then approves, rejects or asks for more." },
  { who: "Builder", title: "Signs the terms", short: "Builder signs", detail: "Supply, authorities, treasury and fee split, signed by wallet before anything goes on-chain." },
  { who: "Startit team", title: "Launches on Raydium", short: "Live on Raydium", detail: "Previewed, confirmed and sent. Addresses are checked on-chain and published." },
];

const SPLIT = [
  { label: "Community", bps: DEFAULT_SPLIT.communityBps, cls: "bg-[#2ee5ff]" },
  { label: "Builder", bps: DEFAULT_SPLIT.founderBps, cls: "bg-[#ff9cf6]" },
  { label: "Startit", bps: DEFAULT_SPLIT.platformBps, cls: "bg-white/60" },
  { label: "Launcher", bps: DEFAULT_SPLIT.launcherBps, cls: "bg-[#d8ff3c]" },
];

type Action = { href: string; label: string };

/** The brand card: a press-me START button, the slogan, the route and the split, in one slim glass strip. */
export function StartPanel({ primary, secondary, as: Tag = "h1" }: { primary: Action; secondary: Action; as?: "h1" | "h2" }) {
  return (
    <Reveal>
      <section aria-labelledby="start-title" className="start-panel px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-4 sm:gap-6">
          <StartButton href={primary.href} label={primary.label} />
          <div className="min-w-0 flex-1">
            <Tag id="start-title" className="serif-title text-[1.6rem] leading-[1.05] text-white sm:text-[2.5rem]">
              Scaling undervalued products through meme community
            </Tag>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={primary.href} className="btn-panel">{primary.label}<span aria-hidden>›</span></Link>
              <Link href={secondary.href} className="btn-panel ghost">{secondary.label}<span aria-hidden>›</span></Link>
            </div>
          </div>
        </div>

        <ol className="mt-4 flex gap-1.5 overflow-x-auto pb-1 text-[0.8125rem] [scrollbar-width:none] sm:flex-wrap">
          {STEPS.map((s, i) => (
            <li key={s.title} title={`${s.who}: ${s.detail}`}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-1 ring-1 ring-white/15">
              <span className="grid size-5 place-items-center rounded-full bg-white/90 text-[0.6875rem] font-extrabold text-[#5a0a10]">{i + 1}</span>
              <span className="font-semibold whitespace-nowrap text-white">{s.short}</span>
            </li>
          ))}
        </ol>

        <div className="mt-3 flex items-center gap-3 text-[0.75rem] text-white/80">
          <span className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full sm:w-40" role="img" aria-label={SPLIT.map((s) => `${s.label} ${bpsToPercent(s.bps)}`).join(", ")}>
            {SPLIT.map((s) => <span key={s.label} className={s.cls} style={{ width: `${s.bps / 100}%` }} />)}
          </span>
          <span className="truncate">Fees: {SPLIT.map((s) => `${bpsToPercent(s.bps)} ${s.label === "Startit" ? s.label : s.label.toLowerCase()}`).join(" · ")}</span>
        </div>
      </section>
    </Reveal>
  );
}
