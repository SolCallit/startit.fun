import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Container, FindingBadge, Mono, Notice, Panel, StatusBadge } from "@/components/ui";
import { getPublicFees, getPublicProject } from "@/lib/data/public";
import { FeeRecordLists, FeeTotals } from "@/components/fee-records";
import { bpsToPercent } from "@/lib/domain/fees";

export default function ProjectPage({ params }: PageProps<"/projects/[ref]">) {
  return (
    <Container className="py-14">
      <Suspense fallback={<p className="text-muted">Loading project…</p>}>
        <Project params={params} />
      </Suspense>
    </Container>
  );
}

const explorer = (addr: string, network: string | null) =>
  `https://explorer.solana.com/address/${addr}${network === "solana-devnet" ? "?cluster=devnet" : ""}`;

async function Project({ params }: { params: PageProps<"/projects/[ref]">["params"] }) {
  const { ref } = await params;
  const data = await getPublicProject(ref);
  if (!data) notFound();
  const { project: p, findings } = data;

  return (
    <>
      <header className="mb-10 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={p.status} />
          <Mono className="text-muted">{p.public_ref}</Mono>
        </div>
        <h1 className="mt-4 text-[2.5rem] leading-tight font-bold tracking-[-0.02em] text-ink">
          {p.project_name} <span className="text-muted">${p.ticker}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">{p.project_summary}</p>
      </header>

      {p.network === "solana-devnet" ? (
        <div className="mb-8"><Notice tone="warn">This token is on Solana devnet, a test network. It has no monetary value.</Notice></div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Verification findings">
          {findings.length === 0 ? (
            <p className="text-ink-soft">No published findings yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {findings.map((f, i) => (
                <li key={i} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                  <FindingBadge status={f.status} />
                  <div className="min-w-0">
                    <p className="text-ink">{f.claim}</p>
                    {f.url ? (
                      <p className="mt-1 text-[0.875rem] text-muted">
                        <a href={f.url} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-cobalt hover:underline">{f.url}</a>
                        {f.fetched_at ? <> · checked {new Date(f.fetched_at).toUTCString()}</> : null}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Fee split">
            {p.platform_bps === null ? (
              <p className="text-ink-soft">Not disclosed yet. A split is published before launch.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                <div><dt className="text-[0.875rem] text-muted">Community</dt><dd className="text-[1.375rem] font-bold text-ink">{bpsToPercent(p.community_bps!)}</dd></div>
                <div><dt className="text-[0.875rem] text-muted">Founder</dt><dd className="text-[1.375rem] font-bold text-ink">{bpsToPercent(p.founder_bps!)}</dd></div>
                <div><dt className="text-[0.875rem] text-muted">Launcher</dt><dd className="text-[1.375rem] font-bold text-ink">{bpsToPercent(p.launcher_bps ?? 0)}</dd></div>
                <div><dt className="text-[0.875rem] text-muted">Platform</dt><dd className="text-[1.375rem] font-bold text-ink">{bpsToPercent(p.platform_bps)}</dd></div>
              </dl>
            )}
          </Panel>

          <Panel title="Token">
            <dl className="grid gap-3 text-[0.9375rem]">
              <Row label="Name">{p.token_name}</Row>
              <Row label="Mint">{p.mint_address ? <a href={explorer(p.mint_address, p.network)} className="text-cobalt hover:underline" target="_blank" rel="noopener noreferrer"><Mono>{p.mint_address}</Mono></a> : "Not launched"}</Row>
              <Row label="Mint authority">{p.mint_authority_revoked === null ? "—" : p.mint_authority_revoked ? "Revoked" : "Retained — see disclosures"}</Row>
              <Row label="Freeze authority">{p.freeze_authority_revoked === null ? "—" : p.freeze_authority_revoked ? "Revoked" : "Retained — see disclosures"}</Row>
              <Row label="Treasury">{p.treasury_address ? <Mono>{p.treasury_address}</Mono> : "Not set"}</Row>
              {p.is_multisig ? <Row label="Treasury control">{p.threshold}-of-N multisig</Row> : null}
            </dl>
            {p.insider_allocation_disclosure ? (
              <p className="mt-4 border-t border-line pt-4 text-[0.9375rem] text-ink-soft">{p.insider_allocation_disclosure}</p>
            ) : null}
          </Panel>
        </div>
      </div>
      {p.status === "launched" ? <ProjectFees refId={p.public_ref} /> : null}
    </>
  );
}

async function ProjectFees({ refId }: { refId: string }) {
  const r = await getPublicFees(refId);
  if (!r.connected) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[1.375rem] font-semibold text-ink">Fees collected and paid</h2>
      <div className="flex flex-col gap-6">
        <FeeTotals claims={r.claims} payouts={r.payouts} />
        <FeeRecordLists claims={r.claims} payouts={r.payouts} />
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
