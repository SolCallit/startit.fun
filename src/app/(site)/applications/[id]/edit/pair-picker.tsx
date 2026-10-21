"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";

export type PairOption = { mint: string; symbol: string; name: string; category?: string; logo_url?: string | null; network?: string };
const LIVE_NETWORK = "solana-devnet";

const LABEL: Record<string, string> = {
  xstocks: "xStocks", prestocks: "PreStocks", currencies: "Currencies", solana: "Solana", majors: "Majors", custom: "Custom",
};
const ORDER = ["xstocks", "prestocks", "currencies", "majors", "solana", "custom"];
const PAGE = 18;

/** StonkFun-style pair browser: categories, search, logo grid. Posts `quote_mint`. */
export function PairPicker({ options, value, onChange }: { options: PairOption[]; value: string; onChange: (mint: string) => void }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of options) m.set(o.category ?? "custom", (m.get(o.category ?? "custom") ?? 0) + 1);
    return m;
  }, [options]);
  const tabs = ORDER.filter((c) => counts.get(c));
  const selected = options.find((o) => o.mint === value);
  const [tab, setTab] = useState(selected?.category ?? tabs[0] ?? "solana");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);

  const needle = q.trim().toLowerCase();
  const list = options.filter((o) =>
    needle ? `${o.symbol} ${o.name} ${o.mint}`.toLowerCase().includes(needle) : (o.category ?? "custom") === tab);

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="quote_mint" value={value} />
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {tabs.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={!needle && tab === c}
            onClick={() => { setTab(c); setQ(""); setShown(PAGE); }}
            className={`relative rounded-full px-3 py-1 text-[0.8125rem] font-semibold transition-colors ${!needle && tab === c ? "text-start-ink" : "text-ink-soft hover:text-ink"}`}>
            {!needle && tab === c ? <motion.span layoutId="pair-tab" className="absolute inset-0 rounded-full bg-start" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
            <span className="relative">{LABEL[c] ?? c} <span className="opacity-70">{counts.get(c)}</span></span>
          </button>
        ))}
      </div>
      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
        placeholder={`Search ${options.length} tokens by symbol, name or address`} aria-label="Search pairs"
        className="w-full rounded-[12px] border border-line-strong/80 bg-surface/70 px-3.5 py-2.5 text-[0.9375rem] text-ink placeholder:text-muted focus:border-cobalt focus:outline-none" />
      <div role="radiogroup" aria-label="Pair with" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.slice(0, shown).map((o) => {
          const on = o.mint === value;
          const soon = !!o.network && o.network !== LIVE_NETWORK;
          return (
            <motion.button key={o.mint} type="button" role="radio" aria-checked={on} aria-disabled={soon} whileTap={soon ? undefined : { scale: 0.96 }}
              onClick={() => { if (!soon) onChange(o.mint); }} title={soon ? "Available when Startit moves to mainnet" : undefined}
              className={`relative flex min-w-0 items-center gap-2.5 rounded-[12px] border px-2.5 py-2 text-left transition-colors ${soon ? "cursor-not-allowed border-line/50 bg-surface/30 opacity-60" : on ? "border-start bg-start/15" : "border-line/70 bg-surface/50 hover:border-line-strong"}`}>
              {soon ? <span className="absolute top-1 right-1.5 rounded-full bg-review-soft px-1.5 text-[0.625rem] font-bold text-review">Mainnet</span> : null}
              {o.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={o.logo_url} alt="" width={28} height={28} loading="lazy" className="size-7 shrink-0 rounded-full bg-surface-2 object-cover" />
                : <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[0.6875rem] font-bold text-ink-soft">{o.symbol.slice(0, 2)}</span>}
              <span className="min-w-0">
                <span className="block truncate text-[0.875rem] font-bold text-ink">{o.symbol}</span>
                <span className="block truncate text-[0.75rem] text-muted">{o.name}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {list.length === 0 ? <p className="text-[0.875rem] text-muted">No pairs match.</p> : null}
      {options.some((o) => o.network && o.network !== LIVE_NETWORK) ? (
        <p className="text-[0.8125rem] text-muted">Pairs marked Mainnet are Raydium&apos;s live list. They unlock when Startit launches on mainnet; on devnet you can pick the others.</p>
      ) : null}
      {list.length > shown ? (
        <button type="button" onClick={() => setShown((n) => n + 30)} className="self-center text-[0.875rem] font-semibold text-cobalt hover:underline">
          Show {Math.min(30, list.length - shown)} more <span className="text-muted">({shown} of {list.length})</span>
        </button>
      ) : null}
    </div>
  );
}
