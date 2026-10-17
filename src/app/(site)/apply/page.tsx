import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { startApplication } from "@/lib/applications/actions";

export const metadata: Metadata = { title: "Launch a coin" };

const NEEDS = [
  "A name, ticker and a line or two about the product",
  "Its website, X or GitHub (Telegram and Discord if it has them)",
  "Proof the builder is in: a screenshot, a post or an email from them",
  "An image for the coin",
  "Optional: a starter's buy, like a creator's buy",
];

export default function Apply() {
  return (
    <Container className="py-14">
      <PageHeader
        title="Launch a coin for a product you back"
        lede="You don't have to be on the team, you just need the builder's sign-off. Three quick screens: your coin, the fee split, and an optional starter's buy."
      />
      <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <section className="glass rounded-[22px] p-6">
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
        <aside className="glass rounded-[22px] p-6 text-ink-soft">
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
