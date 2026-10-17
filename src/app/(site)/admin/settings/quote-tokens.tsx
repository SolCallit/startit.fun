"use client";

import { useActionState, useState, useTransition } from "react";
import { useTxWallet } from "@/components/use-wallet";
import { TxSummary, type TxSummaryView } from "@/components/tx-summary";
import { addQuoteToken, prepareAllowQuote, sendAllowQuote, setQuoteEnabled } from "@/lib/launch/quote-actions";

export type QuoteRow = {
  mint: string; symbol: string; name: string; decimals: number; launchlab_config_id: string;
  platform_allowed_at: string | null; enabled: boolean;
};

const SOL = "So11111111111111111111111111111111111111112";
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const input = "w-full rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-ink focus:border-cobalt focus:outline-none";

/** Admin: which tokens a launch can be paired with on-chain (the bonding curve's quote token). */
export function QuoteTokens({ rows, platformReady }: { rows: QuoteRow[]; platformReady: boolean }) {
  const [state, add, adding] = useActionState(addQuoteToken, null);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-soft">
        A launch can trade against any token here instead of SOL. Raydium has to have created a LaunchLab config for the token;
        we check that on-chain, then allow it on our platform with the admin wallet. Fees for these launches are collected in that token.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-[16px] border border-line bg-surface">
        {rows.map((q) => <Row key={q.mint} q={q} platformReady={platformReady} />)}
      </ul>

      <form action={add} className="flex flex-col gap-3 rounded-[16px] border border-dashed border-line-strong p-4">
        <p className="font-semibold text-ink">Add a quote token</p>
        <input name="mint" placeholder="Token mint address" className={input} required />
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <input name="symbol" placeholder="SPYx" className={input} required />
          <input name="name" placeholder="SP500 xStock" className={input} required />
        </div>
        <button type="submit" disabled={adding} className="btn-chrome self-start">{adding ? "Checking Raydium…" : "Check and add"}</button>
        {state ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-verified" : "text-flagged"}>{state.ok ? state.message : state.error}</p> : null}
      </form>
    </div>
  );
}

function Row({ q, platformReady }: { q: QuoteRow; platformReady: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const allowed = q.mint === SOL || !!q.platform_allowed_at;
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="font-display text-[1.0625rem] font-extrabold text-ink">{q.symbol}</span>
          <span className="ml-2 text-ink-soft">{q.name}</span>
          <span className="block truncate font-mono text-[0.75rem] text-muted">{q.mint}</span>
        </span>
        <label className="flex items-center gap-2 text-[0.875rem] text-ink-soft">
          <span>{q.enabled ? "On" : "Off"}</span>
          <input
            type="checkbox" role="switch" className="switch" checked={q.enabled}
            disabled={pending || q.mint === SOL || !allowed}
            aria-label={`Offer ${q.symbol} as a pair`}
            onChange={(e) => start(async () => { setErr(null); const r = await setQuoteEnabled(q.mint, e.target.checked); if (!r.ok) setErr(r.error); })}
          />
        </label>
      </div>
      {!allowed ? (platformReady ? <AllowFlow mint={q.mint} symbol={q.symbol} /> : <p className="text-[0.875rem] text-muted">Set up the LaunchLab platform first.</p>) : null}
      {err ? <p role="alert" className="text-[0.875rem] text-flagged">{err}</p> : null}
    </li>
  );
}

function AllowFlow({ mint, symbol }: { mint: string; symbol: string }) {
  const w = useTxWallet();
  const [prep, setPrep] = useState<{ txBase64: string; summary: TxSummaryView } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-paper/60 p-3">
      <p className="text-[0.875rem] text-ink-soft">Not allowed on our platform yet. Sign with the platform admin wallet.</p>
      {!w.address ? (
        <div className="flex flex-wrap gap-2">
          {w.wallets.map((x) => <button key={x.name} type="button" className="btn-chrome" onClick={() => run("Connecting…", async () => { await w.connect(x); })}>Connect {x.name}</button>)}
        </div>
      ) : !prep ? (
        <button type="button" className="btn-chrome self-start" disabled={!!busy} onClick={() => run("Building…", async () => {
          const r = await prepareAllowQuote(mint, w.address!); if (!r.ok) throw new Error(r.error); setPrep({ txBase64: r.txBase64, summary: r.summary });
        })}>Build allow transaction for {symbol}</button>
      ) : (
        <>
          <TxSummary s={prep.summary} labels={{ [w.address]: "your admin wallet" }} />
          <button type="button" className="btn-start self-start" disabled={!!busy} onClick={() => run("Waiting for your wallet…", async () => {
            const signed = await w.signTransaction(fromB64(prep.txBase64)); setBusy("Sending…");
            const r = await sendAllowQuote(mint, w.address!, toB64(signed)); if (!r.ok) throw new Error(r.error);
            setMsg({ ok: true, text: `Allowed: ${r.signature}` }); setPrep(null);
          })}>Sign and send on devnet</button>
        </>
      )}
      {busy ? <p role="status" className="text-[0.875rem] text-ink-soft">{busy}</p> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-[0.875rem] ${msg.ok ? "text-verified" : "text-flagged"}`}>{msg.text}</p> : null}
    </div>
  );
}
