"use client";

import { useActionState, useState } from "react";
import { useTxWallet } from "@/components/use-wallet";
import { TxSummary, type TxSummaryView } from "@/components/tx-summary";
import { clearPayoutPause, preparePayoutProposal, submitPayoutProposal, type SettingState } from "@/lib/fees/actions";

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const sol = (lamports: string) => `${(Number(lamports) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;

export type PendingRow = { id: string; ref: string; recipient: string; address: string; amountRaw: string };

export function PayoutProposer({ rows, paused }: { rows: PendingRow[]; paused: boolean }) {
  const w = useTxWallet();
  const [selected, setSelected] = useState<string[]>(rows.slice(0, 8).map((r) => r.id));
  const [prep, setPrep] = useState<{ txBase64: string; ticket: string; transactionIndex: string; summary: TxSummaryView; totalLamports: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 8 ? s : [...s, id]));

  if (!rows.length) return <p className="text-ink-soft">No pending payouts.</p>;
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line rounded-md border border-line">
        {rows.map((r) => (
          <li key={r.id}>
            <label className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-[0.9375rem]">
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} disabled={!!prep} className="accent-[var(--cobalt)]" />
              <span><span className="font-semibold text-ink">{r.ref}</span> · {r.recipient} · <span className="font-mono text-[0.8125rem] text-muted">{r.address.slice(0, 6)}…{r.address.slice(-6)}</span></span>
              <span className="font-semibold text-ink">{sol(r.amountRaw)}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[0.8125rem] text-muted">Up to 8 recipients per proposal.</p>
      {paused ? <p className="text-flagged">Payouts are paused until an admin resumes them.</p> : !w.address ? (
        <div className="flex flex-wrap gap-2">
          {w.wallets.map((x) => <button key={x.name} type="button" onClick={() => run("Connecting…", async () => { await w.connect(x); })}
            className="rounded-full border-[1.5px] border-line bg-surface shadow-raise-sm px-3 py-2 font-semibold text-ink hover:border-ink">Connect {x.name}</button>)}
          {!w.wallets.length ? <p className="text-ink-soft">No Solana wallet found.</p> : null}
        </div>
      ) : !prep ? (
        <button type="button" disabled={!selected.length || !!busy} onClick={() => run("Building the Squads proposal…", async () => {
          const r = await preparePayoutProposal(w.address!, selected);
          if (!r.ok) throw new Error(r.error);
          setPrep(r);
        })} className="self-start rounded-full bg-cobalt shadow-raise-sm active:translate-y-[2px] active:shadow-none px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Build proposal for {selected.length} payout(s)</button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-ink">Squads transaction #{prep.transactionIndex} paying {sol(prep.totalLamports)} from the Fee Router. Signing creates the proposal only; other signers must approve and execute it in Squads.</p>
          <div className="rounded-md border border-line bg-paper p-4"><TxSummary s={prep.summary} labels={{ SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf: "Squads v4", [w.address]: "your wallet" }} /></div>
          <div className="flex gap-3">
            <button type="button" disabled={!!busy} onClick={() => run("Waiting for your wallet…", async () => {
              const signed = await w.signTransaction(fromB64(prep.txBase64));
              setBusy("Creating proposal…");
              const r = await submitPayoutProposal(selected, prep.transactionIndex, prep.ticket, toB64(signed));
              if (!r.ok) throw new Error(r.error);
              setMsg({ ok: true, text: `Proposal created (${r.signature}). Approve and execute it in Squads; the indexer confirms payouts once executed.` }); setPrep(null);
            })} className="rounded-full bg-cobalt shadow-raise-sm active:translate-y-[2px] active:shadow-none px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Sign and create proposal</button>
            <button type="button" onClick={() => setPrep(null)} className="rounded-full border-[1.5px] border-line bg-surface shadow-raise-sm px-4 py-2.5 font-semibold text-ink">Cancel</button>
          </div>
        </div>
      )}
      {busy ? <p role="status" className="text-ink-soft">{busy}</p> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-verified" : "text-flagged"}>{msg.text}</p> : null}
    </div>
  );
}

export function ResumeButton() {
  const [state, action, pending] = useActionState<SettingState, FormData>(clearPayoutPause, {});
  return (
    <form action={action} className="mt-3 flex items-center gap-3">
      <button type="submit" disabled={pending} className="rounded-full border-[1.5px] border-line bg-surface shadow-raise-sm px-3 py-2 font-semibold text-ink hover:border-ink">I investigated — resume payouts</button>
      {state.error ? <span className="text-flagged">{state.error}</span> : null}
      {state.message ? <span className="text-verified">{state.message}</span> : null}
    </form>
  );
}
