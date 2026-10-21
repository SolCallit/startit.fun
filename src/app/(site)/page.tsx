import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StartPanel } from "@/components/start-panel";
import { WelcomeChips } from "@/components/welcome-chips";
import { ButtonLink, Container, FindingBadge } from "@/components/ui";
import { FINDING_STATUSES, type FindingStatus } from "@/lib/domain/findings";
import { DEFAULT_SPLIT, bpsToPercent } from "@/lib/domain/fees";


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
      <section>
        <Container className="pt-8 pb-16 sm:pt-14 sm:pb-24">
          <StartPanel primary={{ href: "/apply", label: "Launch token" }} secondary={{ href: "/explore", label: "Browse market" }} />
          <p className="mx-auto mt-8 max-w-2xl text-center text-[1.0625rem] leading-relaxed text-ink-soft">
            Launch a native meme for a promising, undervalued product or brand: crypto or web2, viral or not yet, solo or team.
            Memecoins have the crowd and the capital; plenty of good products have neither. Half of every trading fee goes to the community.
          </p>
          <WelcomeChips className="mt-5 justify-center" />
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
          <dl className="divide-y divide-line rounded-[18px] glass">
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
