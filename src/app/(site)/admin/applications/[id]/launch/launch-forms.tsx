"use client";

import { NETWORK_LABEL } from "@/lib/network";

import { useActionState, useState } from "react";
import { createSigningLink, markReadyForDeployment, saveLaunchConfig, type ConfigState, type LinkState } from "@/lib/launch/actions";

const input = "w-full rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2 text-ink focus:border-cobalt focus:outline-none aria-[invalid=true]:border-flagged";

function F({ name, label, hint, d, e, rows, mono }: { name: string; label: string; hint?: string; d: Record<string, string>; e?: Record<string, string>; rows?: number; mono?: boolean }) {
  const cls = `${input} ${mono ? "font-mono text-[0.875rem]" : ""}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="font-medium text-ink">{label}</label>
      {hint ? <p className="text-[0.8125rem] text-muted">{hint}</p> : null}
      {rows ? <textarea id={name} name={name} rows={rows} defaultValue={d[name]} aria-invalid={!!e?.[name]} className={cls} />
        : <input id={name} name={name} defaultValue={d[name]} aria-invalid={!!e?.[name]} className={cls} spellCheck={false} />}
      {e?.[name] ? <p className="text-[0.8125rem] text-flagged">{e[name]}</p> : null}
    </div>
  );
}

const DEFAULT_RULES = "Treasury funds are spent only for the community (marketing, liquidity, rewards). Every spend is posted on the project page with its transaction.";

export function LaunchConfigForm({ appId, defaults, selfLaunch }: { appId: string; defaults: Record<string, string>; selfLaunch: boolean }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(saveLaunchConfig.bind(null, appId), {});
  const d = { ...defaults, ...state.values };
  if (!d.treasury_rules) d.treasury_rules = DEFAULT_RULES;
  const e = state.errors;
  const [multisig, setMultisig] = useState(d.treasury_is_multisig === "yes");
  const keys = ["community_bps", "founder_bps", "launcher_bps", "platform_bps"] as const;
  const LABEL = { community_bps: "Community", founder_bps: "Brand", launcher_bps: "Starter", platform_bps: "Startit" };
  const [bps, setBps] = useState(() => Object.fromEntries(keys.map((k) => [k, Number(d[k] || 0)])) as Record<(typeof keys)[number], number>);
  const [editSplit, setEditSplit] = useState(!!d.deviation_reason || !!e?.community_bps || !!e?.deviation_reason);
  const total = keys.reduce((n, k) => n + bps[k], 0);

  return (
    <form action={action} className="flex flex-col gap-7" noValidate>
      {e?._form ? <p role="alert" className="rounded-md border border-flagged/40 bg-flagged-soft px-4 py-3 text-flagged">{e._form}</p> : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[1.0625rem] font-semibold text-ink">Fee split</legend>
        <p className="text-ink-soft">{keys.filter((k) => !(selfLaunch && k === "launcher_bps")).map((k) => `${bps[k] / 100}% ${LABEL[k].toLowerCase()}`).join(" · ")}</p>
        {keys.map((k) => <input key={k} type="hidden" name={k} value={bps[k]} />)}
        <label className="flex items-center gap-3 text-ink-soft">
          <input type="checkbox" role="switch" className="switch" checked={editSplit} onChange={(ev) => setEditSplit(ev.target.checked)} />
          Change the split
        </label>
        {editSplit ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {keys.filter((k) => !(selfLaunch && k === "launcher_bps")).map((k) => (
                <div key={k} className="flex flex-col gap-1">
                  <label htmlFor={`pct-${k}`} className="text-[0.875rem] font-medium text-ink">{LABEL[k]} %</label>
                  <input id={`pct-${k}`} type="number" min={0} max={100} step={0.5} value={bps[k] / 100} className={input}
                    onChange={(ev) => setBps((o) => ({ ...o, [k]: Math.round(Number(ev.target.value) * 100) }))} />
                </div>
              ))}
            </div>
            <p className={`text-[0.875rem] font-semibold ${total === 10000 ? "text-verified" : "text-flagged"}`}>Total {total / 100}%{total === 10000 ? "" : ", it has to be 100%"}</p>
            <F name="deviation_reason" label="Why a different split?" hint="Shown on the project page, so buyers know why it isn't the usual split." d={d} e={e} rows={2} />
          </>
        ) : <input type="hidden" name="deviation_reason" value={d.deviation_reason ?? ""} />}
        {e?.community_bps ? <p className="text-[0.8125rem] text-flagged">{e.community_bps}</p> : null}
        {e?.launcher_bps ? <p className="text-[0.8125rem] text-flagged">{e.launcher_bps}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[1.0625rem] font-semibold text-ink">Who gets paid</legend>
        <F name="founder_wallet" label="Brand wallet" mono d={d} e={e} hint="Where the brand's 30% goes. They prove it's theirs when they sign the terms." />
        {selfLaunch ? <input type="hidden" name="launcher_wallet" value="" /> :
          <F name="launcher_wallet" label="Starter wallet" mono d={d} e={e} hint="The person who brought the product here. They sign with this wallet too." />}
        <F name="treasury_address" label="Community treasury wallet" mono d={d} e={e} hint="Where the community's 50% goes." />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[1.0625rem] font-semibold text-ink">Treasury safety</legend>
        <input type="hidden" name="treasury_is_multisig" value={multisig ? "yes" : "no"} />
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="font-medium text-ink">Shared wallet (multisig)</span>
            <span className="block text-[0.875rem] text-muted">Needs several people to approve every spend, so no one person can drain the treasury. Recommended for real launches; fine to leave off for a test.</span>
          </span>
          <input type="checkbox" role="switch" className="switch mt-0.5" checked={multisig} onChange={(ev) => setMultisig(ev.target.checked)} />
        </label>
        {multisig ? (
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <F name="treasury_threshold" label="Approvals needed" hint="e.g. 2" d={d} e={e} />
            <F name="treasury_signers" label="Wallets that can approve" hint="One per line, e.g. 3 wallets with 2 approvals needed." mono rows={3} d={d} e={e} />
          </div>
        ) : (
          <><input type="hidden" name="treasury_threshold" value="" /><input type="hidden" name="treasury_signers" value="" /></>
        )}
        <F name="treasury_rules" label="How the treasury is used" hint="Shown publicly. Edit if this project needs different rules." rows={3} d={d} e={e} />
      </fieldset>

      <details className="rounded-[14px] border border-line/70 p-4">
        <summary className="cursor-pointer font-medium text-ink">Coin details (standard, nothing to change)</summary>
        <p className="mt-3 text-[0.9375rem] text-ink-soft">1 billion supply, 6 decimals. Nobody can mint more or freeze wallets. Runs on {NETWORK_LABEL}.</p>
        <div className="mt-3"><F name="insider_allocations" label="Coins held by insiders at launch" rows={2} d={d} e={e} hint="Leave empty for none. One per line: who | how many | note." /></div>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" disabled={pending || total !== 10000} className="btn-start">{pending ? "Saving…" : "Save"}</button>
        {state.message ? <p role="status" className="text-[0.9375rem] text-verified">{state.message}</p> : null}
      </div>
    </form>
  );
}

export function SigningLinkButton({ appId, role, disabled }: { appId: string; role: "founder" | "launcher"; disabled?: boolean }) {
  const [state, action, pending] = useActionState<LinkState, FormData>(createSigningLink.bind(null, appId, role), {});
  const full = state.url && typeof window !== "undefined" ? `${window.location.origin}${state.url}` : state.url;
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending || disabled}
        className="self-start btn-chrome">
        {pending ? "Creating…" : `Create ${role} signing link`}
      </button>
      {state.error ? <p className="text-[0.875rem] text-flagged">{state.error}</p> : null}
      {full ? (
        <div className="rounded-md border border-cobalt/30 bg-cobalt-soft p-3 text-[0.875rem]">
          <p className="text-ink">Send this to the {role} privately. It&apos;s shown once, works once, and expires in 7 days.</p>
          <input readOnly value={full} onFocus={(ev) => ev.currentTarget.select()} className="mt-2 w-full rounded border border-line bg-surface px-2 py-1.5 font-mono text-[0.8125rem] text-ink" />
        </div>
      ) : null}
    </form>
  );
}

export function ReadyButton({ appId, blockers }: { appId: string; blockers: string[] }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(markReadyForDeployment.bind(null, appId), {});
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3 text-ink-soft">
        <input type="checkbox" role="switch" checked={confirm} onChange={(ev) => setConfirm(ev.target.checked)} className="switch shrink-0" />
        I reviewed the signed terms. Marking ready publishes the fee split and terms and freezes them.
      </label>
      <button type="submit" disabled={pending || blockers.length > 0 || !confirm}
        className="self-start btn-start">
        {pending ? "Checking…" : "Mark ready for deployment"}
      </button>
      {state.errors?._form ? <p role="alert" className="text-flagged">{state.errors._form}</p> : null}
      {state.message ? <p role="status" className="text-verified">{state.message}</p> : null}
    </form>
  );
}
