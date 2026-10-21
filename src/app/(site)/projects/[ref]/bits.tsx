"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";

export function CopyChip({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); }}
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong/70 px-2.5 py-1 font-mono text-[0.75rem] text-ink-soft hover:text-ink" title={value}>
      {label} {value.slice(0, 4)}…{value.slice(-4)}
      <span aria-live="polite" className={done ? "text-verified" : ""}>{done ? "✓" : "⧉"}</span>
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return (
    <div className="glass rounded-[20px]">
      <div role="tablist" className="flex gap-1 border-b border-line/60 px-3 pt-2">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={on === t.key} type="button" onClick={() => setOn(t.key)}
            className={`relative px-3 py-2 text-[0.9375rem] font-bold ${on === t.key ? "text-ink" : "text-muted hover:text-ink"}`}>
            {t.label}
            {on === t.key ? <motion.span layoutId="coin-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-start" /> : null}
          </button>
        ))}
      </div>
      <div className="p-3 sm:p-4">{tabs.find((t) => t.key === on)?.content}</div>
    </div>
  );
}
