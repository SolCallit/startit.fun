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

/** The hero board: one centered START button that opens (or continues) your application, on red-black glass. */
export function StartPanel({ href, label, hint, action, as: Tag = "h1" }: { href: string; label: string; hint: string; action?: () => Promise<void>; as?: "h1" | "h2" }) {
  return (
    <Reveal>
      <section aria-labelledby="start-title" className="ignite-board relative overflow-hidden px-4 pt-6 pb-5 text-center sm:px-10 sm:pt-9">
        <Tag id="start-title" className="serif-title mx-auto max-w-3xl text-[1.55rem] leading-[1.05] text-white sm:text-[2.6rem]">
          Scaling undervalued brands &amp; products through meme community
        </Tag>
        <p className="mx-auto mt-2 max-w-xl text-[0.875rem] leading-snug text-white/75 sm:text-[1rem]">
          For devs, content creators, brands and artists. Trade their trending success now.
        </p>

        <ol className="mx-auto mt-4 flex max-w-3xl justify-start gap-1.5 overflow-x-auto pb-1 text-[0.75rem] [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:text-[0.8125rem]">
          {STEPS.map((s, i) => (
            <li key={s.title} title={`${s.who}: ${s.detail}`}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.07] py-1 pr-3 pl-1 ring-1 ring-white/10">
              <span className="grid size-5 place-items-center rounded-full bg-[#e3232e] text-[0.6875rem] font-extrabold text-white">{i + 1}</span>
              <span className="font-semibold whitespace-nowrap text-white/90">{s.short}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 sm:mt-7">
          <StartButton href={href} label={label} hint={hint} action={action} />
        </div>

        <div className="mx-auto mt-4 flex max-w-xl items-center justify-center gap-3 text-[0.75rem] text-white/70">
          <span className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:w-32" role="img" aria-label={SPLIT.map((s) => `${s.label} ${bpsToPercent(s.bps)}`).join(", ")}>
            {SPLIT.map((s) => <span key={s.label} className={s.cls} style={{ width: `${s.bps / 100}%` }} />)}
          </span>
          <span className="truncate">Fees: {SPLIT.map((s) => `${bpsToPercent(s.bps)} ${s.label === "Startit" ? s.label : s.label.toLowerCase()}`).join(" · ")}</span>
        </div>
      </section>
    </Reveal>
  );
}
