import { ButtonLink, Container, FindingBadge } from "@/components/ui";
import { FINDING_STATUSES, type FindingStatus } from "@/lib/domain/findings";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";

const PIPELINE: { actor: string; step: string; detail: string }[] = [
  {
    actor: "Founder",
    step: "Applies with evidence",
    detail: "Website, GitHub, official accounts, proof they speak for the company, and written approval of the token and its branding.",
  },
  {
    actor: "AI screening agent",
    step: "Checks what can be checked",
    detail: "Reads public sources, compares them with the application, and records every finding with its source and timestamp. It can recommend — it cannot approve.",
  },
  {
    actor: "Startit operator",
    step: "Reviews and decides",
    detail: "A person verifies the founder's identity and authorization, reads the evidence, and approves, rejects or asks for more.",
  },
  {
    actor: "Founder",
    step: "Signs the launch terms",
    detail: "Token configuration, supply, authorities, treasury controls and fee split are disclosed and signed before anything goes on-chain.",
  },
  {
    actor: "Startit operator",
    step: "Launches on Raydium LaunchLab",
    detail: "Only after both confirmations. The transaction is previewed first, and the deployed addresses are verified and published after.",
  },
];

const FINDING_MEANING: Record<FindingStatus, string> = {
  VERIFIED: "Confirmed against a public source we link to.",
  UNVERIFIED: "Claimed by the founder, but we found no source either way.",
  NEEDS_REVIEW: "Evidence exists but is ambiguous; a person has to judge it.",
  FLAGGED: "Evidence contradicts the claim, or something looks like impersonation.",
};

export default function Home() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div className="flex flex-col justify-center">
            <h1 className="text-[2.75rem] leading-[1.02] font-bold tracking-[-0.035em] text-ink sm:text-[4rem]">
              Real products.
              <br />
              Founder-approved tokens.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.1875rem] leading-relaxed text-ink-soft">
              Startit launches community tokens only for startups whose founders signed off — after an AI screen and a
              human review. We publish what we checked, what we couldn&apos;t, and where every fee goes.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/apply">Apply to launch</ButtonLink>
              <ButtonLink href="/explore" intent="neutral">Browse projects</ButtonLink>
            </div>
          </div>

          <ol aria-label="How a launch is approved" className="relative">
            {PIPELINE.map((p, i) => (
              <li key={p.step} className="relative grid grid-cols-[2.25rem_1fr] gap-4 pb-7 last:pb-0">
                {i < PIPELINE.length - 1 ? (
                  <span aria-hidden className="absolute top-9 left-[1.0625rem] h-[calc(100%-2.25rem)] w-px bg-line-strong" />
                ) : null}
                <span className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface font-mono text-[0.8125rem] font-semibold text-ink">
                  {i + 1}
                </span>
                <div className="pt-1">
                  <p className="text-[0.875rem] font-medium text-muted">{p.actor}</p>
                  <p className="text-[1.0625rem] font-semibold text-ink">{p.step}</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">{p.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section>
        <Container className="grid gap-12 py-20 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">Every finding says how sure we are</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              Screening reports don&apos;t end in a score. Each claim in an application gets one of four labels, a source
              link, and the time we checked it.
            </p>
          </div>
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
            {FINDING_STATUSES.map((s) => (
              <div key={s} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                <dt className="sm:w-36"><FindingBadge status={s} /></dt>
                <dd className="text-ink-soft">{FINDING_MEANING[s]}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section className="border-y border-line bg-surface">
        <Container className="grid gap-12 py-20 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">Half of trading fees go to the community</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              The default split applies to fees Startit actually collects, not trading volume. Any other split must be
              approved and published before launch.
            </p>
          </div>
          <div>
            <div className="flex h-14 overflow-hidden rounded-md text-[0.9375rem] font-semibold" role="img"
              aria-label={`Community ${bpsToPercent(DEFAULT_SPLIT.communityBps)}, founder ${bpsToPercent(DEFAULT_SPLIT.founderBps)}, launcher ${bpsToPercent(DEFAULT_SPLIT.launcherBps)}, platform ${bpsToPercent(DEFAULT_SPLIT.platformBps)}`}>
              <div className="flex items-center bg-cobalt px-3 text-cobalt-ink" style={{ width: "50%" }}>50%</div>
              <div className="flex items-center bg-cobalt-soft px-3 text-ink" style={{ width: "30%" }}>30%</div>
              <div className="flex items-center justify-center bg-review-soft text-ink" style={{ width: "5%" }} title="Launcher 5%"><span className="sr-only">5%</span></div>
              <div className="flex items-center bg-unverified-soft px-3 text-ink" style={{ width: "15%" }}>15%</div>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-semibold text-ink">Community treasury · 50%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">Held in a published wallet with disclosed control rules.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Founder · 30%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">For approving the launch and building the product.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Launcher · 5%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">For whoever found the startup and brought the founder on board.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Platform · 15%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">Funds screening, security and operations.</dd>
              </div>
            </dl>
            <p className="mt-6 text-[0.875rem] leading-relaxed text-muted">
              When a founder launches their own project there&apos;s no separate launcher, and the platform takes 20%. Fees are
              collected into a Startit multisig and paid out from there. Every collection and payout is shown with its
              transaction signature.
            </p>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-20">
          <div className="max-w-2xl">
            <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">What verification does not mean</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              A working website, a public repository or a post from a founder doesn&apos;t prove a team is trustworthy or
              that a token is safe. Approval means a project passed our checks at the time we made them. It isn&apos;t a
              guarantee, an audit, or a prediction about price — and a product milestone never promises token returns.
            </p>
            <ButtonLink href="/methodology" intent="quiet" className="mt-4">Read the full methodology</ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
