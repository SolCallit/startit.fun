import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink, Container, Mono, Notice, Panel, StatusBadge } from "@/components/ui";
import { StatusTimeline } from "@/components/status-timeline";
import { requireUser } from "@/lib/auth";
import { EDITABLE, getApplicationBundle } from "@/lib/applications/data";
import { resubmitApplication, respondToEvidenceRequest } from "@/lib/applications/actions";
import { bpsToPercent } from "@/lib/domain/fees";
import { getPublicProject } from "@/lib/data/public";
import { StarterBuy } from "./starter-buy";
import { LaunchMine } from "./launch-mine";
import { createClient } from "@/lib/supabase/server";

export default function ApplicationStatus(props: PageProps<"/applications/[id]">) {
  return (
    <Container className="py-12">
      <Suspense fallback={<p className="text-muted">Loading application…</p>}>
        <Status {...props} />
      </Suspense>
    </Container>
  );
}

async function Status({ params, searchParams }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/applications/${id}`);
  const bundle = await getApplicationBundle(id);
  if (!bundle) notFound();
  const { app } = bundle;
  const isOwner = app.applicant_id === user.id;
  const openRequests = bundle.evidenceRequests.filter((r) => !r.responded_at);

  return (
    <>
      <header className="mb-10 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={app.status} />
          <Mono className="text-muted">{app.public_ref}</Mono>
        </div>
        <h1 className="mt-4 text-[2.25rem] leading-tight font-bold tracking-[-0.02em] text-ink">
          {app.project_name ?? "Untitled application"} {app.ticker ? <span className="text-muted">${app.ticker}</span> : null}
        </h1>
        <p className="mt-2 text-[0.875rem] text-muted">This is the launcher&apos;s view of the application.</p>
        {user.isStaff ? (
          <p className="mt-3"><Link href={`/admin/applications/${id}`} className="btn-start">Open admin view</Link></p>
        ) : null}
      </header>

      {sp.submitted ? <div className="mb-8"><Notice>Application submitted. Our AI screening agent will pick it up shortly, then a reviewer will take over.</Notice></div> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          {app.status === "ready_for_deployment" && isOwner ? <LaunchMineFor appId={id} publicRef={app.public_ref} ticker={app.ticker ?? ""} /> : null}
          {app.status === "launched" && isOwner && Number(app.starter_buy_amount) > 0 ? <StarterBuyFor appRef={app.public_ref} appId={id} amount={Number(app.starter_buy_amount)} /> : null}
          {app.status === "evidence_requested" && isOwner ? (
            <Panel title="A reviewer needs more from you">
              <ul className="flex flex-col gap-5">
                {bundle.evidenceRequests.map((r) => (
                  <li key={r.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                    <p className="text-ink">{r.message}</p>
                    <p className="mt-1 text-[0.8125rem] text-muted">Requested {new Date(r.created_at).toLocaleString()}</p>
                    {r.responded_at ? (
                      <p className="mt-3 rounded-md bg-paper px-3 py-2 text-ink-soft">Your reply: {r.response}</p>
                    ) : (
                      <form action={respondToEvidenceRequest.bind(null, id, r.id)} className="mt-3 flex flex-col gap-2">
                        <label htmlFor={`resp-${r.id}`} className="sr-only">Your reply</label>
                        <textarea id={`resp-${r.id}`} name="response" rows={3} required
                          className="rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2 text-ink focus:border-cobalt focus:outline-none" />
                        <button type="submit" className="self-start btn-chrome">Send reply</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
                <ButtonLink href={`/applications/${id}/edit?step=1`} intent="neutral">Edit application</ButtonLink>
                <form action={resubmitApplication.bind(null, id)}>
                  <button type="submit" disabled={openRequests.length > 0}
                    className="btn-start">
                    Resubmit for review
                  </button>
                </form>
              </div>
              {openRequests.length ? <p className="mt-2 text-[0.875rem] text-muted">Reply to every request before resubmitting.</p> : null}
            </Panel>
          ) : null}

          {app.status === "draft" && isOwner ? (
            <Notice>This application is still a draft. <Link href={`/applications/${id}/edit?step=1`} className="font-semibold text-cobalt">Continue editing</Link></Notice>
          ) : null}

          <Panel title="What you submitted">
            <dl className="grid gap-4 text-[0.9375rem]">
              <Item label="Project">{app.project_summary}</Item>
              <Item label="Links">
                <ul className="flex flex-col gap-1">
                  {bundle.links.map((l) => (
                    <li key={l.id}><span className="text-muted">{l.kind}: </span><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-cobalt hover:underline">{l.url}</a></li>
                  ))}
                </ul>
              </Item>
              <Item label="Token">{app.token_name} {app.ticker ? `($${app.ticker})` : ""} on Solana</Item>
              <Item label="Fee split">
                Community {bpsToPercent(app.proposed_community_bps)}, builder {bpsToPercent(app.proposed_founder_bps)}, launcher {bpsToPercent(app.proposed_launcher_bps)}, Startit {bpsToPercent(app.proposed_platform_bps)}
              </Item>
              <Item label="Evidence files">{bundle.evidence.length} uploaded</Item>
            </dl>
            {EDITABLE.includes(app.status) && isOwner ? null : (
              <p className="mt-5 text-[0.875rem] text-muted">Answers are locked while the application is in review.</p>
            )}
          </Panel>
        </div>

        <aside>
          <Panel title="Progress">
            <StatusTimeline status={app.status} transitions={bundle.transitions} />
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children || "—"}</dd>
    </div>
  );
}

async function StarterBuyFor({ appRef, appId, amount }: { appRef: string; appId: string; amount: number }) {
  const pub = await getPublicProject(appRef);
  return <StarterBuy appId={appId} amount={amount} symbol={pub?.project.quote_symbol ?? "SOL"} doneTx={pub?.project.starter_buy_tx ?? null} />;
}

async function LaunchMineFor({ appId, publicRef, ticker }: { appId: string; publicRef: string; ticker: string }) {
  const supabase = await createClient();
  const { data: l } = await supabase.from("launches").select("status, verification, launch_signer, starter_buy_amount, quote_mint").eq("application_id", appId).maybeSingle();
  if (!l) return null;
  const { data: q } = l.quote_mint ? await supabase.from("quote_tokens").select("symbol").eq("mint", l.quote_mint).maybeSingle() : { data: null };
  const retry = l.status === "failed" && !!(l.verification as { txErr?: unknown } | null)?.txErr;
  const approved = l.status === "operator_confirmed" || l.status === "submitted" || retry;
  return <LaunchMine appId={appId} publicRef={publicRef} ticker={ticker} approved={approved} initialStatus={l.status}
    signer={l.launch_signer ?? null} starterBuy={Number(l.starter_buy_amount ?? 0)} quoteSymbol={q?.symbol ?? "SOL"} />;
}
