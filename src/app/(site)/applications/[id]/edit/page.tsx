import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Container, Mono, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { EDITABLE, getApplicationBundle, listQuoteOptions, stepDefaults } from "@/lib/applications/data";
import { STEPS, type StepNumber } from "@/lib/applications/schema";
import { projectImageUrl } from "@/lib/project-image";
import { StepForm } from "./step-form";

export default function EditApplication(props: PageProps<"/applications/[id]/edit">) {
  return (
    <Container className="py-10 sm:py-14">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Editor {...props} />
      </Suspense>
    </Container>
  );
}

async function Editor({ params, searchParams }: PageProps<"/applications/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireUser(`/applications/${id}/edit`);
  const bundle = await getApplicationBundle(id);
  if (!bundle) notFound();
  if (!EDITABLE.includes(bundle.app.status)) redirect(`/applications/${id}`);

  const requested = Number(sp.step);
  const step = (STEPS.some((s) => s.n === requested) ? requested : 1) as StepNumber;
  const quotes = await listQuoteOptions();
  const proofs = bundle.evidence
    .filter((e) => e.kind === "authorization" || e.kind === "founder_approval")
    .map((e) => ({ id: e.id, kb: Math.max(1, Math.round(e.byte_size / 1024)), mime: e.mime_type }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <ol aria-label="Steps" className="flex flex-1 gap-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex-1">
              <Link href={`/applications/${id}/edit?step=${s.n}`} aria-current={s.n === step ? "step" : undefined} className="group block">
                <span className={`block h-1.5 rounded-full transition-colors ${s.n <= step ? "bg-start" : "bg-line-strong/60 group-hover:bg-line-strong"}`} />
                <span className={`mt-2 block text-[0.8125rem] font-semibold ${s.n === step ? "text-ink" : "text-muted"}`}>{s.title}</span>
              </Link>
            </li>
          ))}
        </ol>
        <Mono className="hidden text-muted sm:inline">{bundle.app.public_ref}</Mono>
      </div>

      {bundle.app.status === "evidence_requested" ? (
        <div className="mb-6"><Notice tone="warn">A reviewer asked for more. Update what they asked about, then resubmit from the application page.</Notice></div>
      ) : null}

      <StepForm
        key={step}
        appId={id}
        step={step}
        defaults={stepDefaults(bundle, step)}
        quotes={quotes}
        imageUrl={projectImageUrl(bundle.app.image_path)}
        proofs={proofs}
        quoteMint={bundle.app.quote_mint}
      />
    </div>
  );
}
