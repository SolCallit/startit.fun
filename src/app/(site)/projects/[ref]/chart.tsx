"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

export type ChartTrade = { time: number; price: number; quote: number; side: "buy" | "sell" };

const FRAMES = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1D", 86400]] as const;

/** Candles built from the coin's real curve trades. Price or market cap, any timeframe. */
export function TokenChart({ trades, supply, symbol }: { trades: ChartTrade[]; supply: number; symbol: string }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [frame, setFrame] = useState<number>(trades.length > 60 ? 300 : 60);
  const [mode, setMode] = useState<"price" | "mcap">("mcap");

  const candles = useMemo(() => {
    const k = mode === "mcap" ? supply : 1;
    const asc = [...trades].sort((a, b) => a.time - b.time);
    const map = new Map<number, { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }>();
    let prev: number | null = null;
    for (const t of asc) {
      const b = Math.floor(t.time / frame) * frame;
      const v = t.price * k;
      const c = map.get(b);
      if (!c) map.set(b, { time: b as UTCTimestamp, open: prev ?? v, high: Math.max(prev ?? v, v), low: Math.min(prev ?? v, v), close: v, volume: t.quote });
      else { c.high = Math.max(c.high, v); c.low = Math.min(c.low, v); c.close = v; c.volume += t.quote; }
      prev = v;
    }
    return [...map.values()];
  }, [trades, frame, mode, supply]);

  useEffect(() => {
    if (!box.current) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--ink-soft").trim() || "#c3cfdd";
    const line = css.getPropertyValue("--line").trim() || "#213046";
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: ink, fontFamily: "var(--font-schibsted), system-ui", attributionLogo: false },
      grid: { vertLines: { color: `${line}55` }, horzLines: { color: `${line}55` } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: (p: number) => fmt(p) },
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: "#2fe66a", downColor: "#e3232e", borderVisible: false, wickUpColor: "#2fe66a", wickDownColor: "#e3232e",
      priceFormat: { type: "custom", formatter: (p: number) => fmt(p), minMove: 1e-12 },
    });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#2cc8ff55" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candle.setData(candles.map(({ volume: _v, ...c }) => c));
    vol.setData(candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? "#2fe66a55" : "#e3232e55" })));
    chart.timeScale().fitContent();
    return () => { chart.removeSeries(candle); chart.removeSeries(vol); };
  }, [candles]);

  const last = candles.at(-1);
  return (
    <div className="glass flex flex-col rounded-[20px]">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 px-3 py-2.5">
        <div className="flex gap-1">
          {FRAMES.map(([l, s]) => (
            <button key={l} type="button" onClick={() => setFrame(s)}
              className={`rounded-md px-2 py-1 text-[0.8125rem] font-semibold ${frame === s ? "bg-start text-start-ink" : "text-ink-soft hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-1 rounded-full bg-surface-2/60 p-0.5">
          {(["mcap", "price"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-full px-2.5 py-0.5 text-[0.75rem] font-bold ${mode === m ? "bg-surface text-ink shadow-raise-sm" : "text-muted"}`}>{m === "mcap" ? "Market cap" : "Price"}</button>
          ))}
        </div>
      </div>
      {last ? (
        <p className="px-3 pt-2 font-mono text-[0.75rem] text-muted">
          {symbol} · O {fmt(last.open)} H {fmt(last.high)} L {fmt(last.low)} C <span className={last.close >= last.open ? "text-verified" : "text-flagged"}>{fmt(last.close)}</span> SOL
        </p>
      ) : null}
      <div className="relative h-[300px] sm:h-[380px]">
        <div ref={box} className="absolute inset-0" />
        {candles.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-[0.9375rem] text-muted">No trades yet. The first buy draws the first candle.</p>
        ) : null}
      </div>
    </div>
  );
}

export function fmt(n: number) {
  if (!Number.isFinite(n)) return "–";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (a >= 1) return n.toFixed(3);
  if (a >= 0.001) return n.toFixed(6);
  const s = n.toFixed(20).replace(/0+$/, "");
  const zeros = s.split(".")[1]?.match(/^0*/)?.[0].length ?? 0;
  return `0.0${subscript(zeros)}${s.split(".")[1]!.slice(zeros, zeros + 4)}`;
}
const subscript = (n: number) => String(n).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
