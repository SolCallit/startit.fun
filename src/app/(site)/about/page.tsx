import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = { title: "About us" };

const HOW = [
  { n: 1, who: "You, or anyone who backs the product", title: "Bring a product", body: "Name, ticker, a line about it, its links, an image, and proof the builder is in. You don't have to be on the team." },
  { n: 2, who: "AI agent", title: "Checks the receipts", body: "Reads the public sources and matches them to the application. Every finding comes with a source and a time. It can flag, never approve." },
  { n: 3, who: "Startit team", title: "Human review", body: "A person confirms the builder really signed off, then approves, rejects or asks for more." },
  { n: 4, who: "Builder", title: "Signs the terms", body: "Supply, authorities, treasury and fee split are published and signed by wallet before anything goes on-chain." },
  { n: 5, who: "Startit team", title: "Launches on Raydium", body: "The launch is previewed, confirmed and sent through Raydium LaunchLab, then checked on-chain and published." },
  { n: 6, who: "Everyone", title: "Fees flow back", body: "Collected trading fees split 50% community, 30% builder, 5% launcher and 15% Startit, every payout with its transaction." },
];

const ROADMAP = [
  {
    phase: "Now",
    tone: "bg-[#d8ff3c] text-[#1d2400]",
    title: "Prove the loop on devnet",
    items: [
      "Wallet sign-in, the three-screen application and human review",
      "Raydium LaunchLab launches with SOL and custom stock / coin pairs",
      "Signed launch terms, public fee records and the starter's buy",
    ],
  },
  {
    phase: "Next",
    tone: "bg-[#2ee5ff] text-[#002a30]",
    title: "Go live",
    items: [
      "AI screening switched on for every application",
      "External security review, then mainnet",
      "Starter's buy bundled into the launch itself",
      "Verified milestone updates on every project page",
    ],
  },
  {
    phase: "Scale",
    tone: "bg-[#ff9cf6] text-[#3a0033]",
    title: "Grow the bridge",
    items: [
      "Launcher network: rewards and rankings for people who bring real products",
      "Builder dashboard to post updates and claim fees in one place",
      "More pairs as Raydium and partners enable them: stocks, majors, ecosystem coins",
      "Community treasury tools so holders can see and steer how their 50% is used",
    ],
  },
];

export default function About() {
  return (
    <Container className="py-12 sm:py-16">
      <Reveal>
        <section className="start-panel px-5 py-6 sm:px-8 sm:py-8">
          <p className="text-[0.8125rem] font-semibold tracking-wide text-white/70 uppercase">About Startit</p>
          <h1 className="serif-title mt-2 text-[2.25rem] leading-[1.03] text-white sm:text-[3.5rem]">
            Scaling undervalued brands &amp; products through meme community
          </h1>
          <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-white/85">
            Memecoins have the crowd, the attention and the capital. Plenty of good products have none of that. Startit is
            the bridge: anyone who believes in a product can launch its coin with the builder&apos;s sign-off, and the
            community, the builder and the launcher all share in the trading fees.
          </p>
        </section>
      </Reveal>

      <section className="mt-12">
        <h2 className="text-[1.75rem] text-ink">How it works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HOW.map((s, i) => (
            <li key={s.n}>
              <Reveal delay={i * 0.04} className="glass h-full rounded-[18px] p-5">
                <span className="grid size-8 place-items-center rounded-full bg-start font-display text-[0.9375rem] font-extrabold text-start-ink">{s.n}</span>
                <p className="mt-3 text-[0.8125rem] font-semibold text-muted">{s.who}</p>
                <p className="font-display text-[1.1875rem] font-extrabold text-ink">{s.title}</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[0.9375rem] text-muted">
          The details of what gets checked are in <Link href="/methodology" className="font-semibold text-cobalt hover:underline">How we verify</Link>.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-[1.75rem] text-ink">Roadmap</h2>
        <p className="mt-2 max-w-2xl text-ink-soft">How we plan to scale. These are plans, not promises, and they say nothing about any coin&apos;s price.</p>
        <ol className="relative mt-6 grid gap-4 lg:grid-cols-3">
          {ROADMAP.map((r, i) => (
            <li key={r.phase}>
              <Reveal delay={i * 0.06} className="glass h-full rounded-[18px] p-5">
                <span className={`inline-block rounded-full px-3 py-1 text-[0.8125rem] font-extrabold ${r.tone}`}>{r.phase}</span>
                <p className="mt-3 font-display text-[1.25rem] font-extrabold text-ink">{r.title}</p>
                <ul className="mt-3 flex flex-col gap-2 text-[0.9375rem] text-ink-soft">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2.5"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-cobalt" />{it}</li>
                  ))}
                </ul>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}
