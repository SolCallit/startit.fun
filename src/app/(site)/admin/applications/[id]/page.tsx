import { projectImageUrl } from "@/lib/project-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container, FindingBadge, Mono, Notice, Panel, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getApplicationBundle } from "@/lib/applications/data";
import { getNotes, getScreening, getTransitionsWithActors, signEvidence } from "@/lib/review/data";
import { addNote } from "@/lib/review/actions";
import { OPERATOR_ACTIONS, STATUS_LABEL, SUSPENDABLE } from "@/lib/domain/status";
import { bpsToPercent, isDefaultSplit } from "@/lib/domain/fees";
import { DecisionPanel } from "./decision-panel";

export default function Review(props: PageProps<"/admin/applications/[id]">) {
  return (
    <Container className="py-12">
      <Suspense fallback={<p className="text-muted">Loading application…</p>}>
        <ReviewBody {...props} />
      </Suspense>
    </Container>
  );
}

const REC_TEXT: Record<string, string> = {
  proceed_to_human_review: "Proceed to human review",
  request_evidence: "Request more evidence",
  recommend_rejection: "Recommend rejection",
};

async function ReviewBody({ params }: PageProps<"/admin/applications/[id]">) {
  const { id } = await params;
  await requireStaff();
  const bundle = await getApplicationBundle(id);
  if (!bundle) notFound();
  const { app } = bundle;

  const [screening, notes, history, signed] = await Promise.all([
    getScreening(id),
    getNotes(id),
    getTransitionsWithActors(id),
    signEvidence(bundle.evidence.map((e) => e.storage_path)),
  ]);

  const actions = [
    ...(OPERATOR_ACTIONS[app.status] ?? []),
    ...(SUSPENDABLE.includes(app.status) ? [{ to: "suspended" as const, label: "Suspend", needsReason: true, intent: "danger" as const }] : []),
  ];
  const split = { platformBps: app.proposed_platform_bps, founderBps: app.proposed_founder_bps, launcherBps: app.proposed_launcher_bps, communityBps: app.proposed_community_bps };
  const { latest } = screening;

  return (
    <>
      <p className="mb-6"><Link href="/admin" className="text-cobalt hover:underline">Back to queue</Link></p>
      <header className="mb-10 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={app.status} />
          <Mono className="text-muted">{app.public_ref}</Mono>
        </div>
        <h1 className="mt-4 text-[2.25rem] leading-tight font-bold tracking-[-0.02em] text-ink">
          {app.project_name ?? "Untitled"} {app.ticker ? <span className="text-muted">${app.ticker}</span> : null}
        </h1>
        {["launch_config_pending", "ready_for_deployment", "launched"].includes(app.status) ? (
          <p className="mt-3"><Link href={`/admin/applications/${id}/launch`} className="font-semibold text-cobalt">Open launch configuration</Link></p>
        ) : null}
        <p className="mt-2 text-ink-soft">
          Submitted by {bundle.applicantName ?? "unknown"} ({app.applicant_role ?? "role not given"}{app.applicant_is_founder === false ? ", launching on the founder's behalf" : app.applicant_is_founder ? ", founder" : ""}) · {app.contact_email ?? "no contact email"}
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          <Panel title="AI screening report" aside={latest ? <span className="text-[0.8125rem] text-muted">{latest.run.provider} · {latest.run.model} · prompt {latest.run.prompt_version}</span> : null}>
            {!latest ? (
              <p className="text-ink-soft">Screening hasn&apos;t run yet.</p>
            ) : latest.run.status === "failed" ? (
              <Notice tone="error">The latest screening run failed: {latest.run.error ?? "unknown error"}. Review the evidence manually or re-run screening.</Notice>
            ) : !latest.report ? (
              <p className="text-ink-soft">Screening is running (started {latest.run.started_at ? new Date(latest.run.started_at).toLocaleString() : "—"}).</p>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-6">
                  <div>
                    <p className="text-[0.875rem] text-muted">Recommendation</p>
                    <p className="font-semibold text-ink">{REC_TEXT[latest.report.recommendation] ?? latest.report.recommendation}</p>
                    <p className="text-[0.875rem] text-muted">Confidence {Math.round(latest.report.confidence * 100)}%</p>
                  </div>
                  <p className="text-ink-soft">{latest.report.summary}</p>
                </div>
                <div className="rounded-md border border-review/40 bg-review-soft px-4 py-3">
                  <p className="font-semibold text-review">Limitations — what this report could not check</p>
                  <p className="mt-1 text-ink">{latest.report.limitations}</p>
                </div>
                <ul className="divide-y divide-line">
                  {latest.findings.map((f) => (
                    <li key={f.id} className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:gap-4">
                      <FindingBadge status={f.status} />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{f.claim} <span className="font-normal text-muted">· {f.category}</span></p>
                        <p className="mt-1 text-ink-soft">{f.detail}</p>
                        {f.finding_sources.map((s) => (
                          <p key={s.url + s.fetched_at} className="mt-1 text-[0.8125rem] text-muted">
                            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-cobalt hover:underline">{s.url}</a>
                            {" "}· fetched {new Date(s.fetched_at).toUTCString()}{s.http_status ? ` · HTTP ${s.http_status}` : ""}
                            {s.content_sha256 ? <> · <Mono>{s.content_sha256.slice(0, 12)}</Mono></> : null}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {latest.report.next_steps.length ? (
                  <div>
                    <p className="font-semibold text-ink">Suggested next steps</p>
                    <ul className="mt-2 list-disc pl-5 text-ink-soft">{latest.report.next_steps.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                ) : null}
                <p className="text-[0.8125rem] text-muted">AI findings are evidence for your decision, not a decision. Verify anything marked Needs review or Flagged yourself.</p>
              </div>
            )}
          </Panel>

          <Panel title="Application">
            <dl className="grid gap-4 text-[0.9375rem]">
              <Item label="Product">{app.project_summary}</Item>
              <Item label="Links">
                <ul className="flex flex-col gap-1">{bundle.links.map((l) => (
                  <li key={l.id}><span className="text-muted">{l.kind}: </span><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-cobalt hover:underline">{l.url}</a></li>
                ))}</ul>
              </Item>
              {app.founder_approval_statement ? <Item label="Builder approval (written)"><p className="whitespace-pre-wrap">{app.founder_approval_statement}</p></Item> : null}
              {app.permitted_branding ? <Item label="Permitted branding">{app.permitted_branding}</Item> : null}
              <Item label="Coin">
                <span className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {projectImageUrl(app.image_path) ? <img src={projectImageUrl(app.image_path)!} alt="" className="size-12 rounded-[12px] object-cover" /> : null}
                  <span>{app.token_name} (${app.ticker})</span>
                </span>
              </Item>
              <Item label="Starter's buy">{Number(app.starter_buy_amount) > 0 ? `${Number(app.starter_buy_amount)} in the pair token, right after launch` : "None"}</Item>
              <Item label="Paired with">
                {app.pair_kind ? (
                  <div className="flex flex-col gap-1">
                    <span>
                      <span className="font-semibold">{app.pair_name}</span> <span className="text-muted">({app.pair_kind}, {app.pair_relationship === "official" ? "claims OFFICIAL partnership — needs proof" : "reference only, no affiliation"})</span>
                    </span>
                    {app.pair_mint ? <span className="font-mono text-[0.8125rem] break-all">{app.pair_mint}</span> : null}
                    {app.pair_url ? <a href={app.pair_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-cobalt hover:underline">{app.pair_url}</a> : null}
                    <span className="text-ink-soft">{app.pair_reason}</span>
                  </div>
                ) : <span className="text-muted">Not paired</span>}
              </Item>
              {app.community_plan ? <Item label="Community plan"><p className="whitespace-pre-wrap">{app.community_plan}</p></Item> : null}
              <Item label="Milestones">{bundle.milestones.length ? <ul className="list-disc pl-5">{bundle.milestones.map((m) => <li key={m.id}>{m.title}</li>)}</ul> : null}</Item>
              <Item label="Insider allocations">{app.insider_allocation_disclosure}</Item>
              <Item label="Proposed split">
                Community {bpsToPercent(split.communityBps)}, builder {bpsToPercent(split.founderBps)}, launcher {bpsToPercent(split.launcherBps)}, platform {bpsToPercent(split.platformBps)}
                {!isDefaultSplit(split) ? (
                  <span className="mt-1 block text-review">Non-default split. Reason: {String(app.draft_payload?.split_reason ?? "none given")}</span>
                ) : null}
              </Item>
            </dl>
          </Panel>

          <Panel title="Evidence files">
            {bundle.evidence.length === 0 ? <p className="text-flagged">No evidence uploaded.</p> : (
              <ul className="divide-y divide-line text-[0.9375rem]">
                {bundle.evidence.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="text-ink">{e.kind.replace("_", " ")} · {e.mime_type} · {(e.byte_size / 1024).toFixed(0)} KB</span>
                    <span className="flex items-center gap-3">
                      <Mono className="text-muted">{e.sha256.slice(0, 16)}</Mono>
                      {signed.get(e.storage_path) ? <a href={signed.get(e.storage_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="font-semibold text-cobalt">Open</a> : <span className="text-muted">Unavailable</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.8125rem] text-muted">Links expire after 5 minutes. Treat uploaded files as untrusted.</p>
          </Panel>
        </div>

        <aside className="flex flex-col gap-6">
          <Panel title="Decision">
            <DecisionPanel appId={id} actions={actions} />
          </Panel>

          <Panel title="Internal notes">
            <form action={addNote.bind(null, id)} className="flex flex-col gap-2">
              <label htmlFor="note" className="sr-only">Add a note</label>
              <textarea id="note" name="body" rows={3} required placeholder="Visible to Startit staff only"
                className="rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2 text-ink placeholder:text-muted focus:border-cobalt focus:outline-none" />
              <button type="submit" className="self-start btn-chrome">Add note</button>
            </form>
            <ul className="mt-4 flex flex-col gap-3">
              {notes.map((n) => (
                <li key={n.id} className="border-t border-line pt-3 text-[0.9375rem]">
                  <p className="whitespace-pre-wrap text-ink">{n.body}</p>
                  <p className="mt-1 text-[0.8125rem] text-muted">{n.profiles?.display_name ?? "Staff"} · {new Date(n.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Decision history">
            {history.length === 0 ? <p className="text-ink-soft">No status changes yet.</p> : (
              <ol className="flex flex-col gap-3 text-[0.9375rem]">
                {history.map((h) => (
                  <li key={h.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-ink">{STATUS_LABEL[h.from_status]} → <strong>{STATUS_LABEL[h.to_status]}</strong></p>
                    <p className="text-[0.8125rem] text-muted">{h.profiles?.display_name ?? "Unknown"} ({h.actor_role}) · {new Date(h.created_at).toLocaleString()}</p>
                    {h.reason ? <p className="mt-1 text-ink-soft">{h.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[0.8125rem] text-muted">History is append-only and can&apos;t be edited.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children || <span className="text-flagged">Missing</span>}</dd>
    </div>
  );
}
