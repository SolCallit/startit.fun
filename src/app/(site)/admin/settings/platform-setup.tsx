"use client";

import { NETWORK_LABEL } from "@/lib/network";

import { useState } from "react";
import { useTxWallet } from "@/components/use-wallet";
import { TxSummary, type TxSummaryView } from "@/components/tx-summary";
import { preparePlatformSetup, sendPlatformSetup } from "@/lib/launch/deploy-actions";

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

export function PlatformSetup({ platformId, redirected }: { platformId: string | null; redirected: boolean }) {
  const w = useTxWallet();
  const step: "create" | "redirect" | "done" = !platformId ? "create" : !redirected ? "redirect" : "done";
  const [prep, setPrep] = useState<{ txBase64: string; summary: TxSummaryView; detail: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (step === "done") return <p className="text-verified">LaunchLab platform <span className="font-mono text-[0.875rem]">{platformId}</span> is set up and CPMM creator fees are redirected to the Fee Router.</p>;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft">
        {step === "create"
          ? "Step 1 of 2: create Startit's LaunchLab platform. The connected wallet becomes the platform admin — use a hardware wallet."
          : "Step 2 of 2: send post-graduation CPMM creator fees to the Fee Router. Sign with the same admin wallet."}
      </p>
      {!w.address ? (
        <div className="flex flex-wrap gap-2">
          {w.wallets.length ? w.wallets.map((x) => (
            <button key={x.name} type="button" onClick={() => run("Connecting…", async () => { await w.connect(x); })}
              className="btn-chrome">Connect {x.name}</button>
          )) : <p className="text-ink-soft">No Solana wallet found in this browser.</p>}
        </div>
      ) : !prep ? (
        <button type="button" disabled={!!busy} onClick={() => run("Reading Raydium's live fee and building…", async () => {
          const r = await preparePlatformSetup(w.address!, step);
          if (!r.ok) throw new Error(r.error);
          setPrep({ txBase64: r.txBase64, summary: r.summary, detail: r.detail }); setAck(false);
        })} className="self-start btn-start">
          Build {step === "create" ? "platform" : "fee redirect"} transaction
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-medium text-ink">{prep.detail}</p>
          <div className="rounded-md border border-line bg-paper p-4"><TxSummary s={prep.summary} labels={{ [w.address]: "your admin wallet" }} /></div>
          <label className="flex items-start gap-3 text-ink-soft">
            <input type="checkbox" role="switch" checked={ack} onChange={(e) => setAck(e.target.checked)} className="switch shrink-0" />
            I reviewed the fee rate, programs and signer.
          </label>
          <button type="button" disabled={!ack || !!busy} onClick={() => run("Waiting for your wallet…", async () => {
            const signed = await w.signTransaction(fromB64(prep.txBase64));
            setBusy("Broadcasting…");
            const r = await sendPlatformSetup(w.address!, step, toB64(signed));
            if (!r.ok) throw new Error(r.error);
            setMsg({ ok: true, text: `Done: ${r.signature}. Reload to continue.` }); setPrep(null);
          })} className="self-start btn-start">Sign and send on {NETWORK_LABEL}</button>
        </div>
      )}
      {busy ? <p role="status" className="text-ink-soft">{busy}</p> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-verified" : "text-flagged"}>{msg.text}</p> : null}
    </div>
  );
}
