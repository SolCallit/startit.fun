"use client";

import { useState } from "react";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { useTxWallet } from "@/components/use-wallet";
import { TxSummary, type TxSummaryView } from "@/components/tx-summary";
import { confirmLaunch, prepareLaunch, submitLaunch, verifyLaunch } from "@/lib/launch/deploy-actions";

// Browser-safe base64 (no Node Buffer on the client).
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

type Stage = "connect" | "prepared" | "confirmed" | "submitted" | "done";

/**
 * Runs the launch in four explicit steps. The mint keypair is generated here and never leaves this page;
 * the server receives only its public key, and later the fully-signed transaction.
 */
export function LaunchRunner({ appId, ticker, initialStatus, existingSignature }: { appId: string; ticker: string; initialStatus: string; existingSignature: string | null }) {
  const w = useTxWallet();
  const [stage, setStage] = useState<Stage>(initialStatus === "submitted" ? "submitted" : initialStatus === "finalized" ? "done" : "connect");
  const [mint, setMint] = useState<Keypair | null>(null);
  const [prep, setPrep] = useState<{ txBase64: string; summary: TxSummaryView; poolId: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(existingSignature);
  const [problems, setProblems] = useState<string[] | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const prepare = () => run("Building the launch transaction…", async () => {
    if (!w.address) throw new Error("Connect your wallet first.");
    const kp = Keypair.generate();
    const r = await prepareLaunch(appId, w.address, kp.publicKey.toBase58());
    if (!r.ok) throw new Error(r.error);
    setMint(kp); setPrep({ txBase64: r.txBase64, summary: r.summary, poolId: r.poolId }); setAck(false); setStage("prepared");
  });

  const confirm = () => run("Recording your confirmation…", async () => {
    if (!prep) return;
    const r = await confirmLaunch(appId, prep.summary.messageSha256);
    if (!r.ok) throw new Error(r.error);
    setStage("confirmed");
  });

  const signAndSubmit = () => run("Waiting for your wallet…", async () => {
    if (!prep || !mint) throw new Error("Prepare the launch again — this page was reloaded.");
    const walletSigned = await w.signTransaction(fromB64(prep.txBase64));
    const tx = VersionedTransaction.deserialize(walletSigned);
    tx.sign([mint]);
    setBusy("Broadcasting…");
    const r = await submitLaunch(appId, toB64(tx.serialize()));
    if (!r.ok) throw new Error(r.error);
    setSig(r.signature); setStage("submitted");
  });

  const verify = () => run("Checking the chain…", async () => {
    const r = await verifyLaunch(appId);
    if (!r.ok) throw new Error(r.error);
    setProblems(r.problems);
    if (r.problems.length === 0) setStage("done");
  });

  const explorer = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2 text-[0.8125rem] font-semibold">
        {(["Connect & prepare", "Review & confirm", "Sign & broadcast", "Verify on-chain"] as const).map((label, i) => {
          const idx = ["connect", "prepared", "confirmed", "submitted", "done"].indexOf(stage);
          return <li key={label} className={`rounded-full px-3 py-1 ${i < idx ? "bg-verified-soft text-verified" : i === idx ? "bg-cobalt-soft text-cobalt" : "bg-unverified-soft text-muted"}`}>{i + 1}. {label}</li>;
        })}
      </ol>

      {stage === "connect" ? (
        <div className="flex flex-col gap-3">
          {!w.address ? (
            w.wallets.length ? (
              <div className="flex flex-wrap gap-2">
                {w.wallets.map((x) => (
                  <button key={x.name} type="button" onClick={() => run("Connecting…", async () => { await w.connect(x); })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 font-semibold text-ink hover:border-ink">Connect {x.name}</button>
                ))}
              </div>
            ) : <p className="text-ink-soft">No Solana wallet that can sign transactions was found in this browser.</p>
          ) : (
            <>
              <p className="text-ink-soft">Connected <span className="font-mono text-[0.875rem] text-ink">{w.address}</span> ({w.walletName}). Make sure it&apos;s on <strong>devnet</strong> with a little devnet SOL for fees.</p>
              <button type="button" onClick={prepare} disabled={!!busy} className="self-start rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Prepare launch transaction</button>
            </>
          )}
        </div>
      ) : null}

      {stage === "prepared" && prep && mint ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink">Review exactly what will be signed. The new token&apos;s mint address is <span className="font-mono text-[0.875rem]">{mint.publicKey.toBase58()}</span>; the bonding-curve pool will be <span className="font-mono text-[0.875rem]">{prep.poolId}</span>.</p>
          <div className="rounded-md border border-line bg-paper p-4">
            <TxSummary s={prep.summary} labels={{ [mint.publicKey.toBase58()]: `new $${ticker} mint (generated in this browser)`, ...(w.address ? { [w.address]: "your wallet" } : {}) }} />
          </div>
          <label className="flex items-start gap-3 text-ink-soft">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 accent-[var(--cobalt)]" />
            I checked the programs and signers. Launching creates a public token that can&apos;t be undone.
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={confirm} disabled={!ack || !!busy} className="rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Confirm this transaction</button>
            <button type="button" onClick={prepare} disabled={!!busy} className="rounded-md border border-line-strong bg-surface px-4 py-2.5 font-semibold text-ink">Rebuild</button>
          </div>
        </div>
      ) : null}

      {stage === "confirmed" ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink">Confirmed. Your wallet will ask you to sign; this page then adds the mint&apos;s signature and the server broadcasts it only if it matches what you confirmed.</p>
          <p className="text-[0.875rem] text-muted">Blockhashes expire after about a minute. If signing fails with an expired blockhash, rebuild and confirm again.</p>
          <div className="flex gap-3">
            <button type="button" onClick={signAndSubmit} disabled={!!busy} className="rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Sign and launch on devnet</button>
            <button type="button" onClick={prepare} disabled={!!busy} className="rounded-md border border-line-strong bg-surface px-4 py-2.5 font-semibold text-ink">Rebuild</button>
          </div>
        </div>
      ) : null}

      {stage === "submitted" ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink">Broadcast: {sig ? <a href={explorer(sig)} target="_blank" rel="noopener noreferrer" className="font-mono text-[0.875rem] text-cobalt break-all">{sig}</a> : "—"}</p>
          <button type="button" onClick={verify} disabled={!!busy} className="self-start rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Verify on-chain</button>
          {problems?.length ? <ul className="flex flex-col gap-1 text-flagged">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
        </div>
      ) : null}

      {stage === "done" ? (
        <p role="status" className="rounded-md border border-verified/40 bg-verified-soft px-4 py-3 font-semibold text-verified">
          Launched and verified on-chain. {sig ? <a href={explorer(sig)} target="_blank" rel="noopener noreferrer" className="underline">View transaction</a> : null}
        </p>
      ) : null}

      {busy ? <p role="status" className="text-ink-soft">{busy}</p> : null}
      {err ? <p role="alert" className="text-flagged">{err}</p> : null}
    </div>
  );
}
