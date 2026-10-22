import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TokenMark } from "../../home/cards";
import { projectImageUrl } from "@/lib/project-image";
import { PairBadge, QuoteChip } from "@/components/pair-badge";
import { Container, FindingBadge, Mono, StatusBadge } from "@/components/ui";
import { getPublicFees, getPublicProject } from "@/lib/data/public";
import { FeeRecordLists, FeeTotals } from "@/components/fee-records";
import { bpsToPercent } from "@/lib/domain/fees";
import { getCurrentUser } from "@/lib/auth";
import { createAnonClient } from "@/lib/supabase/anon";
import { getHolders, getPoolState, getTrades, type Holder, type PoolState, type Trade } from "@/lib/market/token-market";
import { listComments, recordView } from "@/lib/community/data";
import { TokenChart } from "./chart";
import { fmt } from "@/lib/market/format";
import { TradePanel } from "./trade-panel";
import { Comments } from "./comments";
import { CopyChip, Tabs } from "./bits";

export async function generateMetadata({ params }: PageProps<"/projects/[ref]">): Promise<Metadata> {
  const { ref } = await params;
  const data = await getPublicProject(ref);
  return { title: data ? `$${data.project.ticker} · ${data.project.token_name}` : "Coin" };
}

export default function CoinPage({ params }: PageProps<"/projects/[ref]">) {
  return (
    <Container className="py-6 sm:py-10">
      <Suspense fallback={<CoinSkeleton />}>
        <Coin params={params} />
      </Suspense>
    </Container>
  );
}

const solscan = (kind: "account" | "token" | "tx", v: string, devnet: boolean) => `https://solscan.io/${kind}/${v}${devnet ? "?cluster=devnet" : ""}`;
const LINK_LABEL: Record<string, string> = { website: "Website", x: "X", github: "GitHub", telegram: "Telegram", discord: "Discord", docs: "Docs", demo: "Demo", other: "Link" };

function volumeSince(trades: Trade[], seconds: number) {
  const from = new Date().getTime() / 1000 - seconds;
  return trades.filter((t) => t.time >= from).reduce((n, t) => n + t.quote, 0);
}

async function safe<T>(f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch { return null; }
}

async function Coin({ params }: { params: PageProps<"/projects/[ref]">["params"] }) {
  const { ref } = await params;
  const data = await getPublicProject(ref);
  if (!data) notFound();
  const { project: p, findings } = data;
  const devnet = p.network !== "solana-mainnet";
  const live = p.status === "launched" && !!p.launchlab_pool_address && !!p.mint_address;

  const pool: PoolState | null = live ? await safe(() => getPoolState(p.launchlab_pool_address!)) : null;
  const [trades, holders, views, comments, user, links] = await Promise.all([
    pool ? safe(() => getTrades(p.launchlab_pool_address!, pool.vaultA, pool.vaultB, pool.decimalsA, pool.decimalsB)) : Promise.resolve(null),
    pool ? safe(() => getHolders(p.mint_address!, pool.supply, pool.vaultA)) : Promise.resolve(null),
    safe(() => recordView(ref)),
    safe(() => listComments(ref)),
    getCurrentUser(),
    createAnonClient().from("public_project_links").select("kind, url").eq("public_ref", ref).then((r) => r.data ?? []),
  ]);
  const q = p.quote_symbol ?? "SOL";
  const vol24 = volumeSince(trades ?? [], 86400);
  const verified = findings.filter((f) => f.status === "VERIFIED").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="glass flex flex-col gap-4 rounded-[22px] p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <TokenMark ticker={p.ticker} size={64} image={projectImageUrl(p.image_path)} />
          <div className="min-w-0">
            <h1 className="truncate text-[1.5rem] leading-tight text-ink sm:text-[1.875rem]">{p.token_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.875rem]">
              <span className="font-mono font-bold text-ink-soft">${p.ticker}</span>
              <QuoteChip symbol={q} />
              {pool?.graduated ? <span className="rounded-full bg-verified-soft px-2 py-0.5 text-[0.75rem] font-bold text-verified">Graduated</span> : <StatusBadge status={p.status} />}
              {devnet ? <span className="rounded-full bg-review-soft px-2 py-0.5 text-[0.75rem] font-bold text-review">Devnet</span> : null}
              <PairBadge pairing={p} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.mint_address ? <CopyChip value={p.mint_address} label="CA" /> : null}
          {p.mint_address ? <a className="btn-chrome !px-3 !py-1.5 !text-[0.8125rem]" href={solscan("token", p.mint_address, devnet)} target="_blank" rel="noopener noreferrer">Solscan ↗</a> : null}
          {views !== null ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/60 px-2.5 py-1 text-[0.8125rem] text-ink-soft" title="Unique visitors, counted once a day">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
              {views.toLocaleString()} {views === 1 ? "view" : "views"}
            </span>
          ) : null}
        </div>
      </header>

      {/* Stats */}
      <section aria-label="Market" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Market cap" value={pool ? `${fmt(pool.marketCapQuote)} ${q}` : "–"} />
        <Stat label="Price" value={pool ? `${fmt(pool.priceQuote)} ${q}` : "–"} />
        <Stat label="24h volume" value={trades ? `${fmt(vol24)} ${q}` : "–"} />
        <div className="glass rounded-[16px] p-3.5">
          <p className="text-[0.75rem] font-semibold text-muted">Bonding curve</p>
          {pool ? (
            <>
              <p className="mt-1 font-display text-[1.125rem] font-extrabold text-ink">{(pool.progress * 100).toFixed(1)}%</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-[linear-gradient(90deg,#2fe66a,#2cc8ff,#ffd02e)]" style={{ width: `${Math.max(2, pool.progress * 100)}%` }} /></div>
              <p className="mt-1 text-[0.6875rem] text-muted">{fmt(pool.raisedQuote)} / {fmt(pool.targetQuote)} {q} to graduate</p>
            </>
          ) : <p className="mt-1 font-display text-[1.125rem] font-extrabold text-ink">–</p>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {live ? (
            <TokenChart trades={(trades ?? []).map((t) => ({ time: t.time, price: t.price, quote: t.quote, side: t.side }))} supply={pool?.supply ?? 0} symbol={p.ticker} />
          ) : (
            <div className="glass grid h-60 place-items-center rounded-[20px] p-6 text-center text-ink-soft">The chart starts when the coin launches.</div>
          )}
          {live ? (
            <Tabs tabs={[
              { key: "trades", label: `Trades${trades ? ` · ${trades.length}` : ""}`, content: <TradesTable trades={trades} q={q} devnet={devnet} /> },
              { key: "holders", label: "Holders", content: <HoldersTable holders={holders} devnet={devnet} /> },
            ]} />
          ) : null}
          <Comments refId={ref} comments={comments ?? []} signedIn={!!user} />
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          {live ? <TradePanel refId={ref} ticker={p.ticker} quoteSymbol={q} priceQuote={pool?.priceQuote ?? null} graduated={!!pool?.graduated} devnet={devnet} /> : null}

          <section className="glass rounded-[20px] p-4">
            <h2 className="text-[1.0625rem] text-ink">About {p.project_name}</h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{p.project_summary}</p>
            {links.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full border border-line-strong/70 px-3 py-1 text-[0.8125rem] font-semibold text-ink-soft hover:text-ink">
                    {LINK_LABEL[l.kind] ?? "Link"} ↗
                  </a>
                ))}
              </div>
            ) : null}
          </section>

          <section className="glass rounded-[20px] p-4 text-[0.875rem]">
            <h2 className="text-[1.0625rem] text-ink">Safety</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-ink-soft">
              <Check ok={p.mint_authority_revoked}>No one can mint more</Check>
              <Check ok={p.freeze_authority_revoked}>No one can freeze wallets</Check>
              <Check ok={verified > 0}>{verified ? `${verified} claims verified` : "Verification report pending"}</Check>
              <Check ok>Brand signed the terms</Check>
            </ul>
            {p.platform_bps !== null ? (
              <p className="mt-3 border-t border-line/60 pt-3 text-ink-soft">
                Fees: <b className="text-ink">{bpsToPercent(p.community_bps!)}</b> community · <b className="text-ink">{bpsToPercent(p.founder_bps!)}</b> brand
                {p.launcher_bps ? <> · <b className="text-ink">{bpsToPercent(p.launcher_bps)}</b> starter</> : null} · <b className="text-ink">{bpsToPercent(p.platform_bps)}</b> Startit
              </p>
            ) : null}
            {Number(p.starter_buy_amount) > 0 ? (
              <p className="mt-2 text-ink-soft">
                Starter&apos;s buy: {Number(p.starter_buy_amount)} {q} disclosed{p.starter_buy_tx ? <> · <a className="text-cobalt hover:underline" target="_blank" rel="noopener noreferrer" href={solscan("tx", p.starter_buy_tx, devnet)}>done</a></> : null}
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      <details className="glass rounded-[20px] p-4 sm:p-5">
        <summary className="cursor-pointer text-[1.0625rem] font-bold text-ink">Verification report and records</summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-ink">Findings</h3>
            {findings.length === 0 ? <p className="text-ink-soft">No published findings yet.</p> : (
              <ul className="divide-y divide-line/60">
                {findings.map((f, i) => (
                  <li key={i} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                    <FindingBadge status={f.status} />
                    <div className="min-w-0 text-[0.9375rem]">
                      <p className="text-ink">{f.claim}</p>
                      {f.url ? <a href={f.url} rel="noopener noreferrer nofollow" target="_blank" className="break-all text-[0.8125rem] text-cobalt hover:underline">{f.url}</a> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <dl className="grid content-start gap-2 text-[0.875rem]">
            <Row label="Mint">{p.mint_address ? <Mono>{p.mint_address}</Mono> : "Not launched"}</Row>
            <Row label="Curve pool">{p.launchlab_pool_address ? <Mono>{p.launchlab_pool_address}</Mono> : "–"}</Row>
            <Row label="Treasury">{p.treasury_address ? <Mono>{p.treasury_address}</Mono> : "Not set"}</Row>
            {p.launch_tx ? <Row label="Launch tx"><a className="text-cobalt hover:underline" href={solscan("tx", p.launch_tx, devnet)} target="_blank" rel="noopener noreferrer"><Mono>{p.launch_tx.slice(0, 20)}…</Mono></a></Row> : null}
            {p.insider_allocation_disclosure ? <Row label="Insiders">{p.insider_allocation_disclosure}</Row> : null}
          </dl>
        </div>
        {p.status === "launched" ? <Suspense fallback={null}><ProjectFees refId={p.public_ref} /></Suspense> : null}
      </details>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-[16px] p-3.5">
      <p className="text-[0.75rem] font-semibold text-muted">{label}</p>
      <p className="mt-1 truncate font-display text-[1.125rem] font-extrabold text-ink">{value}</p>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return <li className="flex items-center gap-2"><span className={ok ? "text-verified" : "text-muted"}>{ok ? "✓" : "○"}</span>{children}</li>;
}

function TradesTable({ trades, q, devnet }: { trades: Trade[] | null; q: string; devnet: boolean }) {
  if (!trades) return <p className="p-2 text-muted">Couldn&apos;t read trades from the chain right now.</p>;
  if (!trades.length) return <p className="p-2 text-muted">No trades yet.</p>;
  return (
    <div className="max-h-[26rem] overflow-y-auto">
      <table className="w-full text-[0.8125rem]">
        <thead className="sticky top-0 bg-paper/80 text-left text-muted backdrop-blur"><tr><th className="py-1.5 font-semibold">Time</th><th className="font-semibold">Side</th><th className="text-right font-semibold">{q}</th><th className="text-right font-semibold">Coins</th><th className="pl-3 font-semibold">Trader</th></tr></thead>
        <tbody>
          {trades.slice(0, 100).map((t) => (
            <tr key={t.sig} className="border-t border-line/40">
              <td className="py-1.5 text-muted">{new Date(t.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
              <td className={`font-bold ${t.side === "buy" ? "text-verified" : "text-flagged"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td className="text-right font-mono text-ink">{fmt(t.quote)}</td>
              <td className="text-right font-mono text-ink-soft">{fmt(t.coins)}</td>
              <td className="pl-3"><a className="font-mono text-cobalt hover:underline" href={solscan("tx", t.sig, devnet)} target="_blank" rel="noopener noreferrer">{t.trader.slice(0, 4)}…{t.trader.slice(-4)}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldersTable({ holders, devnet }: { holders: Holder[] | null; devnet: boolean }) {
  if (!holders) return <p className="p-2 text-muted">Couldn&apos;t read holders from the chain right now.</p>;
  if (!holders.length) return <p className="p-2 text-muted">No holders yet.</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {holders.map((h, i) => (
        <li key={h.account} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-[0.8125rem]">
          <span className="text-muted">{i + 1}</span>
          <span className="min-w-0">
            <a className="font-mono text-ink hover:text-cobalt" href={solscan("account", h.owner, devnet)} target="_blank" rel="noopener noreferrer">{h.owner.slice(0, 4)}…{h.owner.slice(-4)}</a>
            {h.label ? <span className="ml-2 rounded-full bg-cobalt-soft px-1.5 py-0.5 text-[0.6875rem] font-bold text-cobalt">{h.label}</span> : null}
            <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-start" style={{ width: `${Math.min(100, h.pct * 100)}%` }} /></span>
          </span>
          <span className="text-right font-mono text-ink">{(h.pct * 100).toFixed(2)}%</span>
        </li>
      ))}
    </ol>
  );
}

async function ProjectFees({ refId }: { refId: string }) {
  const r = await getPublicFees(refId);
  if (!r.connected) return null;
  return (
    <section className="mt-6">
      <h3 className="mb-3 font-semibold text-ink">Fees collected and paid</h3>
      <div className="flex flex-col gap-6">
        <FeeTotals claims={r.claims} payouts={r.payouts} />
        <FeeRecordLists claims={r.claims} payouts={r.payouts} />
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-ink">{children}</dd>
    </div>
  );
}

function CoinSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-5">
      <div className="glass h-24 rounded-[22px]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="glass h-20 rounded-[16px]" />)}</div>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]"><div className="glass h-[26rem] rounded-[20px]" /><div className="glass h-80 rounded-[20px]" /></div>
    </div>
  );
}
