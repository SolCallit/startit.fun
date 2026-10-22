"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MeResponse } from "@/app/api/me/route";
import { STATUS_LABEL, type ApplicationStatus } from "@/lib/domain/status";
import { Sheet } from "./sheet";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const statusLabel = (s: string) => STATUS_LABEL[s as ApplicationStatus] ?? s;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const sol = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const explorer = (kind: "address" | "tx", id: string, network: MeResponse["network"]) =>
  `https://explorer.solana.com/${kind}/${id}${network === "solana-devnet" ? "?cluster=devnet" : ""}`;

/** Account chip in the header; opens the profile panel with the wallet's Startit activity. */
export function ProfilePanel({ label, wallet, signOut }: { label: string; wallet: string | null; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MeResponse) => live && setMe(d))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setFailed(false); setOpen(true); }}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-full border-[1.5px] border-line-strong bg-surface py-1 pr-3.5 pl-1 shadow-raise-sm hover:border-cobalt"
      >
        <Avatar seed={wallet ?? label} />
        <span className="font-mono text-[0.875rem] text-ink">{wallet ? short(wallet) : label}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Your profile">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-[1.25rem] font-extrabold">Profile</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close profile" className="grid size-9 place-items-center rounded-full hover:bg-surface-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5">
          <section className="flex items-center gap-4">
            <Avatar seed={wallet ?? label} size={56} />
            <div className="min-w-0">
              <p className="truncate font-display text-[1.25rem] font-extrabold">{wallet ? short(wallet) : label}</p>
              <p className="text-[0.875rem] text-muted">
                {me ? (me.roles.includes("admin") ? "Admin" : me.roles.includes("operator") ? "Operator" : "Starter") : " "}
              </p>
            </div>
          </section>

          {wallet ? (
            <section className="rounded-[16px] glass p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[0.875rem] text-muted">Wallet</span>
                <CopyButton value={wallet} />
              </div>
              <p className="mt-1 break-all font-mono text-[0.8125rem] text-ink-soft">{wallet}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label={me?.network === "solana-mainnet" ? "SOL balance" : "Devnet SOL"} value={me ? (me.solBalance === null ? "Unavailable" : sol(me.solBalance)) : "…"} />
                <Stat label="Paid to you" value={me ? `${sol(me.payouts.filter((p) => p.status === "confirmed").reduce((t, p) => t + p.sol, 0))} SOL` : "…"} />
              </div>
              {me ? (
                <a href={explorer("address", wallet, me.network)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[0.875rem] font-semibold text-cobalt hover:underline">
                  View on Solana Explorer
                </a>
              ) : null}
            </section>
          ) : null}

          {failed ? <p role="alert" className="text-flagged">Couldn&apos;t load your profile. Close and open it to try again.</p> : null}

          <Block title="Launches">
            {!me ? <Skeleton /> : me.launches.length === 0 ? (
              <Empty>Nothing launched yet. When a project of yours goes live, its token and volume show here.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {me.launches.map((l) => (
                  <li key={l.ref} className="flex items-center justify-between gap-3 rounded-[12px] glass px-3 py-2.5">
                    <Link href={`/projects/${l.ref}`} className="min-w-0 font-semibold hover:text-cobalt">
                      <span className="block truncate">{l.name}</span>
                      <span className="font-mono text-[0.8125rem] text-muted">${l.ticker}</span>
                    </Link>
                    <span className="text-right text-[0.8125rem] text-muted">Volume<br /><span className="text-ink-soft">not tracked yet</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Applications">
            {!me ? <Skeleton /> : me.applications.length === 0 ? (
              <Empty>No applications. <Link href="/apply" className="font-semibold text-cobalt hover:underline">Start one</Link></Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {me.applications.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link href={`/applications/${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-cobalt">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{a.name ?? "Untitled application"}</span>
                        <span className="text-[0.8125rem] text-muted">{statusLabel(a.status)}</span>
                      </span>
                      {a.ticker ? <span className="font-mono text-[0.8125rem] text-muted">${a.ticker}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Payouts and claims">
            {!me ? <Skeleton /> : me.payouts.length === 0 ? (
              <Empty>No fee payouts to this wallet yet. Brand and starter shares are paid here, in the token each launch trades against, after fees are collected.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {me.payouts.map((p, i) => (
                  <li key={`${p.tx}-${i}`} className="flex items-center justify-between gap-3 text-[0.9375rem]">
                    <span>
                      <span className="font-semibold">{sol(p.sol)} SOL</span> <span className="text-muted">as {p.recipient}</span>
                      <span className="block text-[0.8125rem] text-muted">{p.ref}</span>
                    </span>
                    {p.tx && me ? (
                      <a href={explorer("tx", p.tx, me.network)} target="_blank" rel="noreferrer" className="text-[0.8125rem] font-semibold text-cobalt hover:underline">{p.status}</a>
                    ) : <span className="text-[0.8125rem] text-muted">{p.status}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Activity">
            {!me ? <Skeleton /> : me.activity.length === 0 ? (
              <Empty>Status changes on your applications show up here.</Empty>
            ) : (
              <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
                {me.activity.map((a, i) => (
                  <li key={i} className="relative text-[0.9375rem]">
                    <span aria-hidden className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-paper bg-cobalt" />
                    <span className="font-semibold">{a.project ?? "Application"}</span> moved to {statusLabel(a.to)}
                    <span className="block text-[0.8125rem] text-muted">{when(a.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Block>
        </div>

        <form action={signOut} className="mt-auto border-t border-line px-5 py-4">
          <button type="submit" className="btn-chrome w-full">{wallet ? "Disconnect wallet" : "Sign out"}</button>
        </form>
      </Sheet>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[1.0625rem]">{title}</h2>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{children}</p>;
const Skeleton = () => <div aria-hidden className="h-12 animate-pulse rounded-[12px] bg-surface" />;
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-paper/60 px-3 py-2.5">
      <p className="text-[0.8125rem] text-muted">{label}</p>
      <p className="font-display text-[1.125rem] font-extrabold">{value}</p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      className="rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold text-cobalt hover:bg-surface-2"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** Ring-segment avatar echoing the logo: four arcs in hues derived from the address. */
function Avatar({ seed, size = 32 }: { seed: string; size?: number }) {
  let h = 0;
  for (const ch of seed) h = (h * 33 + ch.charCodeAt(0)) % 360;
  const hues = [h, (h + 90) % 360, (h + 180) % 360, (h + 270) % 360];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <circle cx="20" cy="20" r="19" fill="var(--surface-2)" stroke="var(--line-strong)" />
      {hues.map((hue, i) => (
        <path key={i} d={arc(20, 20, 14.5, i * 90 + 12, i * 90 + 78)} stroke={`hsl(${hue} 90% 60%)`} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      ))}
      <circle cx="20" cy="20" r="8.5" fill={`hsl(${h} 75% 48%)`} />
    </svg>
  );
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(((a - 90) * Math.PI) / 180), cy + r * Math.sin(((a - 90) * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
}
