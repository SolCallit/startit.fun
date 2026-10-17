import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, EmptyState, Mono, Notice, PageHeader, Panel } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PayoutProposer, ResumeButton, type PendingRow } from "./payout-proposer";

export const metadata: Metadata = { title: "Payouts" };
const sol = (raw: string | number) => `${(Number(raw) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL`;

export default function Payouts() {
  return (
    <Container className="py-12">
      <PageHeader title="Fees and payouts" lede="Fees collected into the Fee Router, how they're split, and what has been paid. Figures come only from confirmed on-chain transactions." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}><Body /></Suspense>
    </Container>
  );
}

async function Body() {
  const user = await requireStaff();
  const supabase = await createClient();
  const [{ data: ledger }, { data: pending }, { data: submitted }, { data: paused }] = await Promise.all([
    supabase.from("fee_ledger").select("*"),
    supabase.from("payouts").select("id, recipient, recipient_address, amount_raw, launches(applications(public_ref))").eq("status", "pending").order("created_at").limit(100),
    supabase.from("payouts").select("id, recipient, amount_raw, squads_transaction_index, proposal_signature, proposed_at").eq("status", "submitted").order("squads_transaction_index"),
    supabase.from("platform_settings").select("value").eq("key", "payouts_paused").maybeSingle(),
  ]);
  const rows: PendingRow[] = (pending ?? []).map((p) => ({
    id: p.id, recipient: p.recipient, address: p.recipient_address, amountRaw: String(p.amount_raw),
    ref: (p.launches as unknown as { applications: { public_ref: string } } | null)?.applications?.public_ref ?? "—",
  }));
  const byIndex = new Map<number, typeof submitted>();
  for (const s of submitted ?? []) byIndex.set(s.squads_transaction_index, [...(byIndex.get(s.squads_transaction_index) ?? []), s]);

  return (
    <div className="flex flex-col gap-8">
      {paused ? (
        <Notice tone="error">
          <strong>Payouts are paused.</strong> {paused.value}
          {user.roles.includes("admin") ? <ResumeButton /> : null}
        </Notice>
      ) : null}

      <Panel title="Ledger by launch">
        {!ledger?.length ? <EmptyState title="No live launches yet">Fees appear here after a launch is verified and the indexer records a claim.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.9375rem]">
              <thead className="text-[0.8125rem] text-muted"><tr><th className="py-2 pr-4 font-medium">Project</th><th className="py-2 pr-4 font-medium">Collected</th><th className="py-2 pr-4 font-medium">Planned</th><th className="py-2 pr-4 font-medium">Paid</th><th className="py-2 pr-4 font-medium">Outstanding</th><th className="py-2 font-medium">Failed</th></tr></thead>
              <tbody className="divide-y divide-line">
                {ledger.map((l) => (
                  <tr key={l.launch_id}><td className="py-2 pr-4 font-semibold text-ink">{l.project_name} <span className="font-normal text-muted">${l.ticker}</span></td>
                    <td className="py-2 pr-4">{sol(l.collected_raw)}</td><td className="py-2 pr-4">{sol(l.planned_raw)}</td><td className="py-2 pr-4">{sol(l.confirmed_raw)}</td>
                    <td className="py-2 pr-4">{sol(l.outstanding_raw)}</td><td className={`py-2 ${Number(l.failed_count) ? "font-semibold text-flagged" : ""}`}>{l.failed_count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Pending payouts"><PayoutProposer rows={rows} paused={!!paused} /></Panel>

      <Panel title="Waiting for Squads approval">
        {byIndex.size === 0 ? <p className="text-ink-soft">No open proposals.</p> : (
          <ul className="flex flex-col gap-3">
            {[...byIndex.entries()].map(([idx, ps]) => (
              <li key={idx} className="border-b border-line pb-3 last:border-0">
                <p className="font-semibold text-ink">Squads transaction #{idx} · {ps!.length} payouts · {sol(ps!.reduce((a, p) => a + Number(p.amount_raw), 0))}</p>
                <p className="text-[0.8125rem] text-muted">Proposed {ps![0]!.proposed_at ? new Date(ps![0]!.proposed_at).toLocaleString() : ""} · <Mono>{ps![0]!.proposal_signature?.slice(0, 16)}…</Mono></p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
