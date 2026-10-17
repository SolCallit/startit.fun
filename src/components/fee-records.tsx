import { EmptyState, Mono } from "@/components/ui";
import type { PublicFeeClaim, PublicPayout } from "@/lib/data/public";

export const sol = (raw: string | number | bigint) => `${(Number(raw) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 6 })} SOL`;
const tx = (s: string, cluster = "devnet") => `https://explorer.solana.com/tx/${s}?cluster=${cluster}`;
const SOURCE: Record<string, string> = { platform_fee: "Bonding-curve fees", lp_fee_key: "Pool LP fees", cpmm_creator_fee: "Pool creator fees" };
const RECIPIENT: Record<string, string> = { community: "Community treasury", founder: "Builder", launcher: "Launcher", platform: "Startit" };

export function FeeTotals({ claims, payouts }: { claims: PublicFeeClaim[]; payouts: PublicPayout[] }) {
  const sum = (xs: { amount_raw: string }[]) => xs.reduce((a, x) => a + BigInt(x.amount_raw), BigInt(0));
  const collected = sum(claims);
  const paid = (r: string) => sum(payouts.filter((p) => p.recipient === r && p.status === "confirmed"));
  const awaiting = sum(payouts.filter((p) => p.status === "pending" || p.status === "submitted"));
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      {[["Collected", collected], ["Awaiting payout", awaiting], ["Paid to community", paid("community")], ["Paid to builders", paid("founder")], ["Paid to launchers", paid("launcher")], ["Paid to Startit", paid("platform")]].map(([label, v]) => (
        <div key={String(label)} className="bg-surface p-4"><dt className="text-[0.8125rem] text-muted">{label as string}</dt><dd className="mt-1 text-[1.125rem] font-bold text-ink">{sol(v as bigint)}</dd></div>
      ))}
    </dl>
  );
}

export function FeeRecordLists({ claims, payouts, showProject }: { claims: PublicFeeClaim[]; payouts: PublicPayout[]; showProject?: boolean }) {
  if (!claims.length && !payouts.length) {
    return <EmptyState title="No fees collected yet">Each collection and payout will be listed here with its Solana transaction.</EmptyState>;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 font-semibold text-ink">Collections</h3>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-[0.9375rem]">
          {claims.map((c) => (
            <li key={c.tx_signature + c.source} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span>{showProject ? <span className="font-semibold text-ink">{c.public_ref} · </span> : null}{SOURCE[c.source]}</span>
              <span className="flex items-center gap-3"><span className="font-semibold text-ink">{sol(c.amount_raw)}</span>
                <a href={tx(c.tx_signature)} target="_blank" rel="noopener noreferrer" className="text-cobalt"><Mono>{c.tx_signature.slice(0, 8)}…</Mono></a></span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-3 font-semibold text-ink">Payouts</h3>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-[0.9375rem]">
          {payouts.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span>{showProject ? <span className="font-semibold text-ink">{p.public_ref} · </span> : null}{RECIPIENT[p.recipient]} <Mono className="text-muted">{p.recipient_address.slice(0, 4)}…{p.recipient_address.slice(-4)}</Mono></span>
              <span className="flex items-center gap-3"><span className="font-semibold text-ink">{sol(p.amount_raw)}</span>
                {p.tx_signature ? <a href={tx(p.tx_signature)} target="_blank" rel="noopener noreferrer" className="text-cobalt"><Mono>{p.tx_signature.slice(0, 8)}…</Mono></a>
                  : <span className={p.status === "failed" ? "font-semibold text-flagged" : "text-muted"}>{p.status === "submitted" ? "awaiting multisig" : p.status}</span>}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
