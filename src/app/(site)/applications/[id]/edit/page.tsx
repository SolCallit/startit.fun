import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Container, Mono, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { EDITABLE, getApplicationBundle, listQuoteOptions, stepDefaults } from "@/lib/applications/data";
import { STEPS, type StepNumber } from "@/lib/applications/schema";
import { EvidenceUploader, StepForm } from "./step-form";

export default function EditApplication(props: PageProps<"/applications/[id]/edit">) {
  return (
    <Container className="py-12">
      <Suspense fallback={<p className="text-muted">Loading application…</p>}>
        <Editor {...props} />
      </Suspense>
    </Container>
  );
}

const EVIDENCE_LABEL: Record<string, string> = {
  authorization: "Authorization proof",
  founder_approval: "Founder approval letter",
  identity: "Builder identity",
  other: "Supporting evidence",
};

async function Editor({ params, searchParams }: PageProps<"/applications/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireUser(`/applications/${id}/edit`);
  const bundle = await getApplicationBundle(id);
  if (!bundle) notFound();
  if (!EDITABLE.includes(bundle.app.status)) redirect(`/applications/${id}`);

  const requested = Number(sp.step);
  const step = (STEPS.some((s) => s.n === requested) ? requested : 1) as StepNumber;
  const meta = STEPS[step - 1]!;

  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Application steps" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-4 text-[0.875rem] text-muted">
          <Mono>{bundle.app.public_ref}</Mono>
        </p>
        <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible">
          {STEPS.map((s) => (
            <li key={s.n} className="shrink-0">
              <Link href={`/applications/${id}/edit?step=${s.n}`} aria-current={s.n === step ? "step" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] ${
                  s.n === step ? "bg-cobalt-soft font-semibold text-ink" : "text-ink-soft hover:bg-surface"}`}>
                <span className="font-mono text-[0.8125rem] text-muted">{s.n}</span>
                {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <section className="max-w-2xl">
        <p className="text-[0.875rem] text-muted">Step {step} of {STEPS.length}</p>
        <h1 className="mt-1 text-[1.875rem] leading-tight font-bold tracking-[-0.02em] text-ink">{meta.title}</h1>
        <p className="mt-2 mb-8 text-ink-soft">{meta.covers}</p>

        {bundle.app.status === "evidence_requested" ? (
          <div className="mb-8"><Notice tone="warn">A reviewer asked for more evidence. Update your answers, then resubmit from the application page.</Notice></div>
        ) : null}

        {step === 3 ? (
          <div className="mb-10 flex flex-col gap-4">
            <h2 className="text-[1.125rem] font-semibold text-ink">Proof of authorization</h2>
            <p className="text-ink-soft">
              Upload something that shows the builder is in: a signed note or screenshot from them, a post from
              the project&apos;s official account, or an email from the team&apos;s domain. This is required to submit.
            </p>
            {bundle.evidence.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-[0.9375rem]">
                {bundle.evidence.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="text-ink">{EVIDENCE_LABEL[ev.kind] ?? ev.kind}</span>
                    <span className="text-muted">{(ev.byte_size / 1024).toFixed(0)} KB · <Mono>{ev.sha256.slice(0, 12)}</Mono></span>
                  </li>
                ))}
              </ul>
            ) : null}
            <EvidenceUploader appId={id} />
          </div>
        ) : null}

        <StepForm key={step} appId={id} step={step} defaults={stepDefaults(bundle, step)} quotes={step === 4 ? await listQuoteOptions() : []} />
      </section>
    </div>
  );
}
