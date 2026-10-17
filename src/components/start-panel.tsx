import Image from "next/image";
import Link from "next/link";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";
import { Reveal } from "@/components/motion";

const STEPS = [
  { who: "You, or anyone who backs the product", title: "Bring a product", detail: "Site, GitHub and socials, plus proof the builder approves the coin, its name and branding." },
  { who: "AI agent", title: "Checks the receipts", detail: "Matches public sources to the application. Every finding has a source and a time. It can flag, never approve." },
  { who: "Startit team", title: "Human review", detail: "Confirms the builder really signed off, then approves, rejects or asks for more." },
  { who: "Builder", title: "Signs the terms", detail: "Supply, authorities, treasury and fee split, signed by wallet before anything goes on-chain." },
  { who: "Startit team", title: "Launches on Raydium", detail: "Previewed, confirmed and sent. Addresses are checked on-chain and published." },
];

const SPLIT = [
  { label: "Community", bps: DEFAULT_SPLIT.communityBps, cls: "bg-[#2ee5ff]" },
  { label: "Builder", bps: DEFAULT_SPLIT.founderBps, cls: "bg-[#ff9cf6]" },
  { label: "Startit", bps: DEFAULT_SPLIT.platformBps, cls: "bg-white/60" },
  { label: "Launcher", bps: DEFAULT_SPLIT.launcherBps, cls: "bg-[#d8ff3c]" },
];

type Action = { href: string; label: string };

/** The brand card: START button, two actions, the headline and the route every launch takes. */
export function StartPanel({ primary, secondary, as: Tag = "h1" }: { primary: Action; secondary: Action; as?: "h1" | "h2" }) {
  return (
    <Reveal>
      <section aria-labelledby="start-title" className="start-panel p-4 sm:p-7">
        <div className="grid gap-4 md:grid-cols-[10.5rem_1fr] md:gap-8">
          <div className="flex items-center gap-4 md:flex-col md:items-stretch">
            <Image src="/brand/startit-logo.png" alt="" width={168} height={168} priority
              className="size-[4.5rem] shrink-0 drop-shadow-[0_8px_18px_#0009] md:size-auto md:w-[9.5rem] md:self-center" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <Link href={primary.href} className="btn-panel">{primary.label}<span aria-hidden>›</span></Link>
              <Link href={secondary.href} className="btn-panel">{secondary.label}<span aria-hidden>›</span></Link>
            </div>
          </div>

          <div className="min-w-0">
            <Tag id="start-title" className="serif-title text-[2rem] leading-[1.02] text-white sm:text-[3.25rem]">
              Undervalued products meet real community
            </Tag>
            <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[0.875rem] leading-snug sm:mt-5 sm:gap-x-6 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/12 font-display text-[0.8125rem] font-extrabold text-white ring-1 ring-white/25">{i + 1}</span>
                  <span>
                    <span className="block text-[0.75rem] font-semibold text-white/60">{s.who.startsWith("You") ? <><span className="sm:hidden">You or any backer</span><span className="hidden sm:inline">{s.who}</span></> : s.who}</span>
                    <span className="block font-bold text-white">{s.title}</span>
                    <span className="hidden text-white/75 sm:block">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-col gap-2 border-t border-white/12 pt-4 sm:flex-row sm:items-center sm:gap-4">
              <span className="shrink-0 text-[0.8125rem] font-semibold text-white/70">Trading fees</span>
              <span className="flex h-2 w-full shrink-0 overflow-hidden rounded-full sm:w-auto sm:flex-1" role="img" aria-label={SPLIT.map((s) => `${s.label} ${bpsToPercent(s.bps)}`).join(", ")}>
                {SPLIT.map((s) => <span key={s.label} className={s.cls} style={{ width: `${s.bps / 100}%` }} />)}
              </span>
              <span className="flex flex-wrap gap-x-3 text-[0.8125rem] text-white/80">
                {SPLIT.map((s) => <span key={s.label}><span className="font-bold text-white">{bpsToPercent(s.bps)}</span> {s.label}</span>)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
