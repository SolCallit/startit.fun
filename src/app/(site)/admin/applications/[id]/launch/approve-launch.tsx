"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLaunch, verifyMyLaunch, type LaunchParams } from "@/lib/launch/self-launch";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** Admin step: approve the exact launch details. The starter then signs the launch (and their starter's buy) themselves. */
export function ApproveLaunch({ appId, params, approved, status, signature }: {
  appId: string; params: LaunchParams | null; approved: boolean; status: string; signature: string | null;
}) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!params) return <p className="text-flagged">Couldn&apos;t load the launch details.</p>;

  if (status === "submitted") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ink">The starter sent the launch: <a className="font-mono text-[0.875rem] text-cobalt break-all" target="_blank" rel="noopener noreferrer" href={`https://solscan.io/tx/${signature}?cluster=devnet`}>{signature}</a></p>
        <button type="button" disabled={pending} className="self-start btn-start" onClick={() => start(async () => {
          const r = await verifyMyLaunch(appId);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg(r.pending ? { ok: true, text: "Not confirmed yet. Try again in a few seconds." } : r.problems.length ? { ok: false, text: r.problems.join(" ") } : { ok: true, text: "Live and verified." });
          router.refresh();
        })}>{pending ? "Checking…" : "Check on-chain"}</button>
        {msg ? <p role="status" className={msg.ok ? "text-verified" : "text-flagged"}>{msg.text}</p> : null}
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Coin", `${params.name} ($${params.symbol})`],
    ["Supply", `${(Number(params.supplyRaw) / 10 ** params.decimals).toLocaleString()} (${params.decimals} decimals)`],
    ["Pair", params.quoteSymbol],
    ["Signed by", `${short(params.signer)} (the starter's wallet on the signed terms)`],
    ["Starter's buy", Number(params.starterBuy) > 0 ? `${params.starterBuy} ${params.quoteSymbol}, in the same transaction` : "None"],
    ["Mint & freeze", "Both revoked at launch"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-2 text-[0.9375rem]">
        {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_1fr] gap-3"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
      </dl>
      {approved ? (
        <p role="status" className="rounded-md border border-verified/40 bg-verified-soft px-4 py-3 font-semibold text-verified">
          Approved. Waiting for the starter to press Launch. It goes live with their starter&apos;s buy in one transaction.
        </p>
      ) : (
        <>
          <label className="flex items-start gap-3 text-ink-soft">
            <input type="checkbox" role="switch" checked={ack} onChange={(e) => setAck(e.target.checked)} className="switch shrink-0" />
            These details are right. Once the starter signs, the coin is public and can&apos;t be undone.
          </label>
          <button type="button" disabled={!ack || pending} className="self-start btn-start" onClick={() => start(async () => {
            const r = await approveLaunch(appId);
            setMsg(r.ok ? { ok: true, text: "Approved. The starter can now press Launch." } : { ok: false, text: r.error });
            router.refresh();
          })}>{pending ? "Approving…" : "Approve launch"}</button>
        </>
      )}
      {msg && status !== "submitted" ? <p role="status" className={msg.ok ? "text-verified" : "text-flagged"}>{msg.text}</p> : null}
    </div>
  );
}
