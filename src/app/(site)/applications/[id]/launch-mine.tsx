"use client";

import { NETWORK_LABEL, solscan } from "@/lib/network";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { useTxWallet } from "@/components/use-wallet";
import { prepareMyLaunch, submitMyLaunch, verifyMyLaunch } from "@/lib/launch/self-launch";

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The starter's launch button. One wallet signature creates the coin and makes the starter's buy together,
 * so nobody can buy before the starter. The new mint's key is generated here and never leaves the page.
 */
export function LaunchMine({ appId, publicRef, ticker, approved, initialStatus, signer, starterBuy, quoteSymbol }: {
  appId: string; publicRef: string; ticker: string; approved: boolean; initialStatus: string; signer: string | null; starterBuy: number; quoteSymbol: string;
}) {
  const router = useRouter();
  const w = useTxWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [sig, setSig] = useState<string | null>(null);

  const check = async () => {
    for (let i = 0; i < 40; i++) {
      const v = await verifyMyLaunch(appId);
      if (!v.ok) throw new Error(v.error);
      if (!v.pending) {
        if (v.problems.length) throw new Error(v.problems.join(" "));
        setLive(true); router.refresh(); return;
      }
      setBusy("Waiting for the network to confirm…");
      await wait(3000);
    }
    throw new Error("Still not confirmed. Refresh this page in a minute.");
  };

  const launch = async () => {
    setErr(null);
    try {
      if (!w.address) throw new Error("Connect your wallet first.");
      setBusy("Building your launch…");
      const kp = Keypair.generate();
      const r = await prepareMyLaunch(appId, w.address, kp.publicKey.toBase58());
      if (!r.ok) throw new Error(r.error);
      setBusy("Confirm in your wallet…");
      const tx = VersionedTransaction.deserialize(await w.signTransaction(fromB64(r.txBase64)));
      tx.sign([kp]);
      setBusy("Launching…");
      const s = await submitMyLaunch(appId, toB64(tx.serialize()));
      if (!s.ok) throw new Error(s.error);
      setSig(s.signature);
      await check();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    setErr(null);
    try { setBusy("Checking…"); await check(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="ignite-board rounded-[22px] p-5 sm:p-6">
      {live ? (
        <div className="flex flex-col items-start gap-3">
          <h2 className="font-display text-[1.5rem] font-extrabold text-ink">${ticker} is live 🚀</h2>
          <p className="text-ink-soft">{starterBuy > 0 ? `Your ${starterBuy} ${quoteSymbol} starter's buy went in with the launch, before anyone else.` : "Your coin is on the curve."}</p>
          <Link href={`/projects/${publicRef}`} className="btn-start">Open the coin page</Link>
        </div>
      ) : !approved ? (
        <>
          <h2 className="font-display text-[1.25rem] font-extrabold text-ink">Almost there</h2>
          <p className="mt-1 text-ink-soft">Everything&apos;s signed. An admin gives the final OK, then the Launch button lights up here.</p>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-[1.5rem] font-extrabold text-ink">Ready to launch ${ticker}</h2>
          <p className="text-ink-soft">
            One signature creates your coin{starterBuy > 0 ? <> and makes your <b className="text-ink">{starterBuy} {quoteSymbol} starter&apos;s buy</b> in the same instant, so no one gets in before you</> : null}.
            You pay about 0.03 SOL in network costs{starterBuy > 0 ? " plus your buy" : ""}.
          </p>
          {signer ? <p className="text-[0.8125rem] text-muted">Use the wallet on your signed terms: <span className="font-mono">{signer.slice(0, 4)}…{signer.slice(-4)}</span>, on {NETWORK_LABEL}.</p> : null}
          <div className="mt-1 flex flex-wrap gap-2">
            {initialStatus === "submitted" && !sig ? (
              <button type="button" disabled={!!busy} onClick={resume} className="btn-start">Check my launch</button>
            ) : !w.address ? (
              w.wallets.length ? w.wallets.map((x) => (
                <button key={x.name} type="button" className="btn-chrome" onClick={() => w.connect(x).catch((e) => setErr(String(e?.message ?? e)))}>Connect {x.name}</button>
              )) : <p className="text-muted">Install a Solana wallet to launch.</p>
            ) : (
              <motion.button whileTap={{ scale: 0.94 }} type="button" disabled={!!busy} onClick={launch} className="btn-start !px-8 !text-[1.0625rem]">
                {busy ?? `Launch $${ticker}`}
              </motion.button>
            )}
          </div>
          {sig ? <a className="font-mono text-[0.8125rem] text-cobalt break-all" target="_blank" rel="noopener noreferrer" href={solscan("tx", sig)}>{sig}</a> : null}
        </div>
      )}
      {busy && !w.address ? <p role="status" className="mt-3 text-ink-soft">{busy}</p> : null}
      {err ? <p role="alert" className="mt-3 text-[0.875rem] text-flagged">{err}</p> : null}
    </motion.section>
  );
}
