"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTxWallet } from "@/components/use-wallet";
import { prepareTrade, sendTrade } from "@/lib/market/trade-actions";

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/** Buy and sell on the bonding curve straight from the coin page, signed in the visitor's own wallet. */
export function TradePanel({ refId, ticker, quoteSymbol, priceQuote, graduated, devnet }: {
  refId: string; ticker: string; quoteSymbol: string; priceQuote: number | null; graduated: boolean; devnet: boolean;
}) {
  const router = useRouter();
  const w = useTxWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);
  const presets = side === "buy" ? ["0.1", "0.5", "1", "2"] : ["10000", "100000", "1000000"];
  const n = Number(amount);
  const estimate = priceQuote && n > 0 ? (side === "buy" ? n / priceQuote : n * priceQuote) : null;

  const trade = async () => {
    setMsg(null);
    try {
      if (!w.address) throw new Error("Connect a wallet first.");
      setBusy("Building…");
      const r = await prepareTrade(refId, w.address, side, amount, slip * 100);
      if (!r.ok) throw new Error(r.error);
      setBusy("Confirm in your wallet…");
      const signed = await w.signTransaction(fromB64(r.txBase64));
      setBusy("Sending…");
      const s = await sendTrade(refId, w.address, toB64(signed));
      if (!s.ok) throw new Error(s.error);
      setMsg({ ok: true, text: side === "buy" ? `Bought $${ticker}` : `Sold $${ticker}`, sig: s.signature });
      setAmount("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  if (graduated) {
    return (
      <div className="glass rounded-[20px] p-5">
        <p className="font-display text-[1.125rem] font-extrabold text-ink">Graduated 🎓</p>
        <p className="mt-1 text-ink-soft">This coin filled its curve and moved to a Raydium pool. Trade it there.</p>
      </div>
    );
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-[20px] p-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2/60 p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} type="button" onClick={() => { setSide(s); setAmount(""); setMsg(null); }}
            className={`relative rounded-full py-2 text-[0.9375rem] font-extrabold capitalize ${side === s ? "text-white" : "text-ink-soft"}`}>
            {side === s ? <motion.span layoutId="trade-side" className={`absolute inset-0 rounded-full ${s === "buy" ? "bg-[#18a957]" : "bg-start"}`} transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
            <span className="relative">{s}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0"
          aria-label={side === "buy" ? `Amount in ${quoteSymbol}` : `Amount of $${ticker}`}
          className="w-full rounded-[14px] border border-line-strong/80 bg-surface/70 px-4 py-3.5 pr-24 font-display text-[1.5rem] font-extrabold text-ink placeholder:text-muted focus:border-cobalt focus:outline-none" />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted">{side === "buy" ? quoteSymbol : `$${ticker}`}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => setAmount(p)} className="rounded-full border border-line-strong/70 px-3 py-1 text-[0.8125rem] font-semibold text-ink-soft hover:text-ink">
            {side === "buy" ? `${p} ${quoteSymbol}` : Number(p).toLocaleString()}
          </button>
        ))}
      </div>
      {estimate ? (
        <p className="text-[0.8125rem] text-muted">
          ≈ {estimate.toLocaleString(undefined, { maximumFractionDigits: side === "buy" ? 0 : 6 })} {side === "buy" ? `$${ticker}` : quoteSymbol} at the current curve price, before fees and slippage.
        </p>
      ) : null}
      <label className="flex items-center justify-between text-[0.8125rem] text-muted">
        Max slippage
        <span className="flex gap-1">
          {[1, 3, 5, 10].map((v) => (
            <button key={v} type="button" onClick={() => setSlip(v)} className={`rounded-md px-2 py-0.5 font-semibold ${slip === v ? "bg-surface-2 text-ink" : "hover:text-ink"}`}>{v}%</button>
          ))}
        </span>
      </label>

      {!w.address ? (
        <div className="flex flex-col gap-2">
          {w.wallets.length ? w.wallets.map((x) => (
            <button key={x.name} type="button" className="btn-chrome" onClick={() => w.connect(x).catch((e) => setMsg({ ok: false, text: String(e?.message ?? e) }))}>Connect {x.name}</button>
          )) : <p className="text-[0.875rem] text-muted">Install a Solana wallet to trade.</p>}
        </div>
      ) : (
        <motion.button whileTap={{ scale: 0.96 }} type="button" disabled={!!busy || !(n > 0)} onClick={trade}
          className={`rounded-full py-3 text-[1rem] font-extrabold text-white disabled:opacity-50 ${side === "buy" ? "bg-[#18a957] shadow-[0_8px_24px_-8px_#18a957]" : "bg-start shadow-[0_8px_24px_-8px_#e3232e]"}`}>
          {busy ?? (side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`)}
        </motion.button>
      )}
      <AnimatePresence>
        {msg ? (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role={msg.ok ? "status" : "alert"}
            className={`text-[0.875rem] ${msg.ok ? "text-verified" : "text-flagged"}`}>
            {msg.text}
            {msg.sig ? <> · <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://solscan.io/tx/${msg.sig}${devnet ? "?cluster=devnet" : ""}`}>view</a></> : null}
          </motion.p>
        ) : null}
      </AnimatePresence>
      {devnet ? <p className="text-[0.75rem] text-muted">Devnet coin: switch your wallet to devnet. Test SOL has no value.</p> : null}
    </div>
  );
}
