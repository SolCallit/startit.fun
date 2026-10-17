"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { useTxWallet } from "@/components/use-wallet";
import { prepareStarterBuy, sendStarterBuy } from "@/lib/launch/starter-buy";

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/** The launcher's disclosed starter's buy, signed in their own wallet once the coin is live. */
export function StarterBuy({ appId, amount, symbol, doneTx }: { appId: string; amount: number; symbol: string; doneTx: string | null }) {
  const w = useTxWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(doneTx ? { ok: true, text: `Done: ${doneTx}` } : null);
  const done = !!doneTx || msg?.ok;

  const run = async () => {
    setMsg(null);
    try {
      if (!w.address) throw new Error("Connect your wallet first.");
      setBusy("Building…");
      const r = await prepareStarterBuy(appId, w.address);
      if (!r.ok) throw new Error(r.error);
      setBusy("Confirm in your wallet…");
      const signed = await w.signTransaction(fromB64(r.txBase64));
      setBusy("Sending…");
      const s = await sendStarterBuy(appId, toB64(signed));
      if (!s.ok) throw new Error(s.error);
      setMsg({ ok: true, text: `Bought. ${s.signature}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-[22px] p-5">
      <h2 className="font-display text-[1.25rem] font-extrabold text-ink">Starter&apos;s buy</h2>
      <p className="mt-1 text-ink-soft">
        {done ? "Your starter's buy is on-chain and shown on the project page." : `Your coin is live. Buy the ${amount} ${symbol} you disclosed, from the wallet on the signed terms.`}
      </p>
      {!done ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!w.address
            ? w.wallets.map((x) => <button key={x.name} type="button" className="btn-chrome" onClick={() => w.connect(x).catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }))}>Connect {x.name}</button>)
            : <motion.button whileTap={{ scale: 0.95 }} type="button" disabled={!!busy} onClick={run} className="btn-start">Buy {amount} {symbol}</motion.button>}
        </div>
      ) : null}
      {busy ? <p role="status" className="mt-3 text-[0.875rem] text-ink-soft">{busy}</p> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`mt-3 break-all text-[0.875rem] ${msg.ok ? "text-verified" : "text-flagged"}`}>{msg.text}</p> : null}
    </motion.section>
  );
}
