import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { startApplication } from "@/lib/applications/actions";

export const metadata: Metadata = { title: "Launch a coin" };

const NEEDS = [
  "The product's website, X account and GitHub",
  "Docs or a live demo, if there is one",
  "Proof the builder is in: a PDF or image, up to 4 MB",
  "The builder's written approval of the coin, its name, ticker and branding",
  "The coin idea, what the product ships next, and how you'll rally the community",
  "Any coins insiders will hold at launch",
];

export default function Apply() {
  return (
    <Container className="py-14">
      <PageHeader
        title="Launch a coin for a product you back"
        lede="You don't have to be on the team, you just need the builder's sign-off. Takes about 20 minutes, and you can save a draft anytime."
      />
      <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="text-[1.25rem] font-semibold text-ink">Have these ready</h2>
          <ul className="mt-4 flex flex-col gap-3 text-ink-soft">
            {NEEDS.map((n) => (
              <li key={n} className="flex gap-3"><span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cobalt" />{n}</li>
            ))}
          </ul>
          <div className="mt-10">
            <Suspense fallback={<span className="text-muted">Checking your account…</span>}>
              <StartButton />
            </Suspense>
          </div>
        </section>
        <aside className="rounded-lg border border-line bg-surface p-6 text-ink-soft">
          <h2 className="font-semibold text-ink">What happens after you submit</h2>
          <p className="mt-3 leading-relaxed">
            Our AI agent checks the public sources and writes a report for a human reviewer. Usually within a few days,
            the reviewer approves it, asks for more, or tells you why not. Nothing launches until the builder has signed
            the final coin and fee terms.
          </p>
        </aside>
      </div>
    </Container>
  );
}

async function StartButton() {
  const user = await getCurrentUser();
  if (!user) return <ButtonLink href="/login?next=/apply">Connect wallet to start</ButtonLink>;
  return (
    <form action={startApplication}>
      <button type="submit" className="btn-start">
        Start application
      </button>
    </form>
  );
}
