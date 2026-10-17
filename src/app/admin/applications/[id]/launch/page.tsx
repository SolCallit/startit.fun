import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container, Mono, Notice, Panel, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getApplicationBundle } from "@/lib/applications/data";
import { getLaunchConfigBundle } from "@/lib/launch/data";
import { defaultSplitFor } from "@/lib/domain/fees";
import { LaunchConfigForm, ReadyButton, SigningLinkButton } from "./launch-forms";
import { LaunchRunner } from "./launch-runner";

export default function LaunchConfig(props: PageProps<"/admin/applications/[id]/launch">) {
  return (
    <Container className="py-12">
      <Suspense fallback={<p className="text-muted">Loading launch configuration…</p>}>
        <Body {...props} />
      </Suspense>
    </Container>
  );
}

async function Body({ params }: PageProps<"/admin/applications/[id]/launch">) {
  const { id } = await params;
  await requireStaff();
  const bundle = await getApplicationBundle(id);
  if (!bundle) notFound();
  const { app } = bundle;
  const cfg = await getLaunchConfigBundle(id);
  const selfLaunch = app.applicant_is_founder === true;
  const editable = app.status === "launch_config_pending";

  const split = cfg.feeConfig
    ? { platformBps: cfg.feeConfig.platform_bps, founderBps: cfg.feeConfig.founder_bps, launcherBps: cfg.feeConfig.launcher_bps, communityBps: cfg.feeConfig.community_bps }
    : { platformBps: app.proposed_platform_bps, founderBps: app.proposed_founder_bps, launcherBps: app.proposed_launcher_bps, communityBps: app.proposed_community_bps };
  const fallback = defaultSplitFor(selfLaunch);
  const t = cfg.treasury;
  const defaults: Record<string, string> = {
    platform_bps: String(split.platformBps ?? fallback.platformBps), founder_bps: String(split.founderBps ?? fallback.founderBps),
    launcher_bps: String(selfLaunch ? 0 : split.launcherBps ?? fallback.launcherBps), community_bps: String(split.communityBps ?? fallback.communityBps),
    deviation_reason: cfg.feeConfig?.deviation_reason ?? String(app.draft_payload?.split_reason ?? ""),
    founder_wallet: cfg.launch?.founder_wallet ?? "", launcher_wallet: cfg.launch?.launcher_wallet ?? "",
    treasury_address: t?.address ?? "", treasury_is_multisig: t ? (t.is_multisig ? "yes" : "no") : "yes",
    treasury_threshold: t?.threshold ? String(t.threshold) : "", treasury_signers: (t?.signers ?? []).join("\n"),
    treasury_rules: t?.control_rules ?? "",
    insider_allocations: ((cfg.launch?.insider_allocations ?? []) as { holder: string; amount: string; note: string }[]).map((a) => `${a.holder} | ${a.amount} | ${a.note}`).join("\n"),
  };

  const current = cfg.launch?.terms_sha256 as string | undefined;
  const signed = (role: "founder" | "launcher") => cfg.agreements.find((a) => a.signer_role === role && a.document_sha256 === current);

  return (
    <>
      <p className="mb-6"><Link href={`/admin/applications/${id}`} className="text-cobalt hover:underline">Back to review</Link></p>
      <header className="mb-8 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-3"><StatusBadge status={app.status} /><Mono className="text-muted">{app.public_ref}</Mono></div>
        <h1 className="mt-3 text-[2rem] leading-tight font-bold tracking-[-0.02em] text-ink">Launch configuration — {app.project_name} <span className="text-muted">${app.ticker}</span></h1>
        <p className="mt-2 text-ink-soft">{selfLaunch ? "The founder submitted this project, so there's no launcher share." : "Submitted by a launcher on the founder's behalf."}</p>
      </header>

      {!cfg.feeRouter ? <div className="mb-6"><Notice tone="warn">No Fee Router address is set. An admin must add it in <Link href="/admin/settings" className="font-semibold text-cobalt">Platform settings</Link> first.</Notice></div> : null}
      {!editable && app.status !== "ready_for_deployment" && app.status !== "launched" ? (
        <div className="mb-6"><Notice tone="warn">Launch settings open once the application is in “Launch configuration pending”.</Notice></div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          {editable ? (
            <Panel title="Settings"><LaunchConfigForm appId={id} defaults={defaults} selfLaunch={selfLaunch} /></Panel>
          ) : null}
          {app.status === "ready_for_deployment" || app.status === "launched" ? (
            <Panel title="Launch on Solana devnet">
              {cfg.launch?.status === "failed" && cfg.launch?.error ? (
                <div className="mb-4"><Notice tone="error">Last attempt failed: {String(cfg.launch.error)}</Notice></div>
              ) : null}
              {app.status === "launched" ? (
                <p className="text-verified">Launched and verified. Mint <Mono>{String(cfg.launch?.mint_address)}</Mono>.</p>
              ) : (
                <LaunchRunner appId={id} ticker={app.ticker ?? ""} initialStatus={String(cfg.launch?.status ?? "planned")} existingSignature={(cfg.launch?.tx_signature as string | null) ?? null} />
              )}
            </Panel>
          ) : null}
          <Panel title="Terms to be signed" aside={current ? <Mono className="text-[0.8125rem] text-muted">sha256 {current.slice(0, 16)}…</Mono> : null}>
            {cfg.launch?.terms_text ? (
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-paper p-4 font-mono text-[0.8125rem] leading-relaxed text-ink">{cfg.launch.terms_text}</pre>
            ) : <p className="text-ink-soft">Save the settings to generate the terms.</p>}
          </Panel>
        </div>

        <aside className="flex flex-col gap-6">
          <Panel title="Signatures on current terms">
            <ul className="flex flex-col gap-4">
              {(["founder", ...(selfLaunch ? [] : ["launcher"])] as ("founder" | "launcher")[]).map((role) => {
                const s = signed(role);
                return (
                  <li key={role} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <p className="font-semibold capitalize text-ink">{role}</p>
                    {s ? (
                      <p className="mt-1 text-[0.875rem] text-verified">Signed {new Date(s.signed_at).toLocaleString()} by <Mono>{s.signer_wallet.slice(0, 6)}…{s.signer_wallet.slice(-6)}</Mono></p>
                    ) : (
                      <>
                        <p className="mt-1 text-[0.875rem] text-muted">Not signed yet.</p>
                        {editable ? <div className="mt-2"><SigningLinkButton appId={id} role={role} disabled={!current} /></div> : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Ready for deployment?">
            {cfg.blockers.length ? (
              <ul className="mb-4 flex flex-col gap-1.5 text-[0.9375rem]">
                {cfg.blockers.map((b) => <li key={b} className="flex gap-2 text-ink-soft"><span aria-hidden className="text-flagged">✕</span>{b}</li>)}
              </ul>
            ) : <p className="mb-4 text-verified">Everything required is in place.</p>}
            {editable ? <ReadyButton appId={id} blockers={cfg.blockers} /> : null}
            {app.status === "ready_for_deployment" ? <p className="text-ink-soft">Terms are frozen and published. Next: the launch transaction.</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}
