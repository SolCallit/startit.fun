import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { startApplication } from "@/lib/applications/actions";

export const metadata: Metadata = { title: "Apply to launch" };

const NEEDS = [
  "Your official website, X account and GitHub organization or repository",
  "Documentation or a live demo, if you have one",
  "Proof that you're authorized to represent the company — a PDF or image, up to 4 MB",
  "Written approval from the founder for the token, its name, ticker and branding",
  "Your token concept, upcoming milestones and community plan",
  "Any tokens insiders will hold at launch",
];

export default function Apply() {
  return (
    <Container className="py-14">
      <PageHeader
        title="Apply to launch a community token"
        lede="It takes about 20 minutes. You can save a draft at any point and come back to it."
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
            Our AI agent checks your public sources and writes a report for a human reviewer. Usually within a few days,
            a reviewer will approve your application, ask for more evidence, or explain why it was declined. Nothing launches
            until you&apos;ve signed the final token and fee terms.
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
