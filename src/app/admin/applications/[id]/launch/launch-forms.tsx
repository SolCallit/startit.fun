"use client";

import { useActionState, useState } from "react";
import { createSigningLink, markReadyForDeployment, saveLaunchConfig, type ConfigState, type LinkState } from "@/lib/launch/actions";

const input = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-ink focus:border-cobalt focus:outline-none aria-[invalid=true]:border-flagged";

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

export function LaunchConfigForm({ appId, defaults, selfLaunch }: { appId: string; defaults: Record<string, string>; selfLaunch: boolean }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(saveLaunchConfig.bind(null, appId), {});
  const d = { ...defaults, ...state.values };
  const e = state.errors;
  const [multisig, setMultisig] = useState(d.treasury_is_multisig !== "no");

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {e?._form ? <p role="alert" className="rounded-md border border-flagged/40 bg-flagged-soft px-4 py-3 text-flagged">{e._form}</p> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-[1.0625rem] font-semibold text-ink">Fee split (basis points, total 10,000)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["community_bps", "founder_bps", "launcher_bps", "platform_bps"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label htmlFor={k} className="text-[0.875rem] font-medium text-ink">{k.replace("_bps", "")}</label>
              <input id={k} name={k} type="number" min={0} max={10000} defaultValue={d[k]}
                readOnly={selfLaunch && k === "launcher_bps"} aria-invalid={!!e?.[k]} className={input} />
            </div>
          ))}
        </div>
        {e?.community_bps ? <p className="text-[0.8125rem] text-flagged">{e.community_bps}</p> : null}
        {e?.launcher_bps ? <p className="text-[0.8125rem] text-flagged">{e.launcher_bps}</p> : null}
        <F name="deviation_reason" label="Reason for a non-default split (published)" d={d} e={e} rows={2} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-[1.0625rem] font-semibold text-ink">Payout wallets</legend>
        <F name="founder_wallet" label="Founder wallet" mono d={d} e={e} hint="Confirm with the founder directly. They'll prove control of it when they sign the terms." />
        {selfLaunch ? <input type="hidden" name="launcher_wallet" value="" /> :
          <F name="launcher_wallet" label="Launcher wallet" mono d={d} e={e} hint="The scout who submitted this project. They'll sign with this wallet." />}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-[1.0625rem] font-semibold text-ink">Community treasury</legend>
        <F name="treasury_address" label="Treasury address" mono d={d} e={e} hint="For a Squads multisig, use the vault address." />
        <div className="flex gap-6 text-ink-soft">
          <label className="flex items-center gap-2"><input type="radio" name="treasury_is_multisig" value="yes" defaultChecked={multisig} onChange={() => setMultisig(true)} className="accent-[var(--cobalt)]" />Multisig</label>
          <label className="flex items-center gap-2"><input type="radio" name="treasury_is_multisig" value="no" defaultChecked={!multisig} onChange={() => setMultisig(false)} className="accent-[var(--cobalt)]" />Single signer</label>
        </div>
        {multisig ? (
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <F name="treasury_threshold" label="Threshold" d={d} e={e} />
            <F name="treasury_signers" label="Signers, one per line" mono rows={3} d={d} e={e} />
          </div>
        ) : (
          <>
            <input type="hidden" name="treasury_threshold" value="" /><input type="hidden" name="treasury_signers" value="" />
            <p className="rounded-md border border-review/40 bg-review-soft px-3 py-2 text-[0.875rem] text-review">A single-signer treasury will be disclosed as such. A multisig is strongly preferred.</p>
          </>
        )}
        <F name="treasury_rules" label="Control rules (published)" rows={3} d={d} e={e} hint="Who can spend treasury funds, how decisions are made, and where spending is reported." />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-[1.0625rem] font-semibold text-ink">Token</legend>
        <p className="text-ink-soft">1,000,000,000 supply, 6 decimals, mint and freeze authority revoked, Solana devnet. Mainnet stays locked until the external review.</p>
        <F name="insider_allocations" label="Insider allocations" rows={3} d={d} e={e} hint="One per line: holder | whole tokens | note. Leave empty for none — the terms will say so." />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" disabled={pending} className="rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink hover:opacity-90 disabled:opacity-50">
          {pending ? "Saving…" : "Save and regenerate terms"}
        </button>
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
        className="self-start rounded-md border border-line-strong bg-surface px-3 py-2 font-semibold text-ink hover:border-ink disabled:opacity-50">
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
        <input type="checkbox" checked={confirm} onChange={(ev) => setConfirm(ev.target.checked)} className="mt-1 accent-[var(--cobalt)]" />
        I reviewed the signed terms. Marking ready publishes the fee split and terms and freezes them.
      </label>
      <button type="submit" disabled={pending || blockers.length > 0 || !confirm}
        className="self-start rounded-md bg-cobalt px-4 py-2.5 font-semibold text-cobalt-ink hover:opacity-90 disabled:opacity-50">
        {pending ? "Checking…" : "Mark ready for deployment"}
      </button>
      {state.errors?._form ? <p role="alert" className="text-flagged">{state.errors._form}</p> : null}
      {state.message ? <p role="status" className="text-verified">{state.message}</p> : null}
    </form>
  );
}
