import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ButtonLink, Container, FindingBadge } from "@/components/ui";
import { FINDING_STATUSES, type FindingStatus } from "@/lib/domain/findings";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";

const PIPELINE: { actor: string; step: string; detail: string }[] = [
  {
    actor: "You, or anyone who backs the product",
    step: "Bring a product",
    detail: "Its site, GitHub and socials, plus proof the builder is in: their approval of the coin, its name and its branding, in their own words.",
  },
  {
    actor: "AI agent",
    step: "Checks the receipts",
    detail: "Reads public sources and matches them to the application. Every finding comes with a source and a timestamp. It can flag things. It can't approve.",
  },
  {
    actor: "Startit team",
    step: "Human review",
    detail: "A person confirms the builder really signed off, reads the evidence, then approves, rejects or asks for more.",
  },
  {
    actor: "Builder",
    step: "Signs the terms",
    detail: "Supply, authorities, treasury and fee split are published and signed with their wallet before anything goes on-chain.",
  },
  {
    actor: "Startit team",
    step: "Launches on Raydium",
    detail: "The transaction is previewed, confirmed and sent, then the addresses are checked on-chain and published.",
  },
];

const FINDING_MEANING: Record<FindingStatus, string> = {
  VERIFIED: "Confirmed against a public source we link to.",
  UNVERIFIED: "Claimed in the application, but we found no source either way.",
  NEEDS_REVIEW: "Evidence exists but is ambiguous; a person has to judge it.",
  FLAGGED: "Evidence contradicts the claim, or something looks like impersonation.",
};

export default function Home() {
  return (
    <>
      <Suspense>
        <SignedInGoesHome />
      </Suspense>
      <section className="border-b border-line">
        <Container className="grid gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div className="flex flex-col justify-center">
            <h1 className="text-[2.75rem] leading-[1.02] font-bold tracking-[-0.035em] text-ink sm:text-[4rem]">
              Memecoin money
              <br />
              for real products.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[1.1875rem] leading-relaxed text-ink-soft">
              Memecoins have the crowd and the capital. Plenty of good products have neither. Back one you believe in, get
              the builder&apos;s sign-off and launch its coin here. Half of every trading fee goes to the community.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/apply">Launch a coin</ButtonLink>
              <ButtonLink href="/explore" intent="neutral">Browse projects</ButtonLink>
            </div>
          </div>

          <ol aria-label="How a launch works" className="relative">
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
              No vibes-based scores. Every claim in an application gets one of four labels, a link to the source and the
              time we checked it.
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
            <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">Half of every trading fee goes to the community</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">
              Split from the fees Startit actually collects, not from volume. Any other split has to be approved and
              published before launch.
            </p>
          </div>
          <div>
            <div className="flex h-14 overflow-hidden rounded-md text-[0.9375rem] font-semibold" role="img"
              aria-label={`Community ${bpsToPercent(DEFAULT_SPLIT.communityBps)}, builder ${bpsToPercent(DEFAULT_SPLIT.founderBps)}, launcher ${bpsToPercent(DEFAULT_SPLIT.launcherBps)}, platform ${bpsToPercent(DEFAULT_SPLIT.platformBps)}`}>
              <div className="flex items-center bg-cobalt px-3 text-cobalt-ink" style={{ width: "50%" }}>50%</div>
              <div className="flex items-center bg-cobalt-soft px-3 text-ink" style={{ width: "30%" }}>30%</div>
              <div className="flex items-center justify-center bg-review-soft text-ink" style={{ width: "5%" }} title="Launcher 5%"><span className="sr-only">5%</span></div>
              <div className="flex items-center bg-unverified-soft px-3 text-ink" style={{ width: "15%" }}>15%</div>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-semibold text-ink">Community, 50%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">Held in a public treasury wallet with published rules.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Builder, 30%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">For the team behind the product, for signing off and shipping.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Launcher, 5%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">For whoever backed the product and brought it here.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Platform, 15%</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">Pays for screening, security and running Startit.</dd>
              </div>
            </dl>
            <p className="mt-6 text-[0.875rem] leading-relaxed text-muted">
              When the builder launches their own coin there&apos;s no launcher cut and the platform takes 20%. Fees collect in
              a Startit multisig and get paid out from there, and every collection and payout is shown with its transaction.
            </p>
          </div>
        </Container>
      </section>

      <section>
        <Container className="py-20">
          <div className="max-w-2xl">
            <h2 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">What verification does not mean</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              A working site, a busy GitHub or a post from the builder doesn&apos;t prove a team is trustworthy or a coin is
              safe. Approval means the project passed our checks when we ran them. It isn&apos;t a guarantee, an audit or a
              price call, and a shipped milestone never promises token returns.
            </p>
            <ButtonLink href="/methodology" intent="quiet" className="mt-4">Read the full methodology</ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}

/** Signed-in visitors skip the marketing page and land in the app. */
async function SignedInGoesHome() {
  if (await getCurrentUser()) redirect("/home");
  return null;
}
