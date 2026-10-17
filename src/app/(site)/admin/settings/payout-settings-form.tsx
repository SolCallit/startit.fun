"use client";

import { useActionState } from "react";
import { savePayoutSettings, type SettingState } from "@/lib/fees/actions";

export function PayoutSettingsForm({ multisig, platform }: { multisig: string | null; platform: string | null }) {
  const [state, action, pending] = useActionState<SettingState, FormData>(savePayoutSettings, {});
  const cls = "rounded-full border-[1.5px] border-line bg-surface shadow-raise-sm px-3 py-2 font-mono text-[0.875rem] text-ink focus:border-cobalt focus:outline-none";
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fee_router_multisig" className="font-medium text-ink">Fee Router multisig (Squads multisig account)</label>
        <p className="text-[0.8125rem] text-muted">Its vault #0 must equal the Fee Router address above. Startit checks this.</p>
        <input id="fee_router_multisig" name="fee_router_multisig" defaultValue={multisig ?? ""} spellCheck={false} className={cls} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="platform_treasury_address" className="font-medium text-ink">Startit platform wallet</label>
        <p className="text-[0.8125rem] text-muted">Receives the platform&apos;s share. Use a separate multisig, not the Fee Router.</p>
        <input id="platform_treasury_address" name="platform_treasury_address" defaultValue={platform ?? ""} spellCheck={false} className={cls} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-cobalt shadow-raise-sm active:translate-y-[2px] active:shadow-none px-4 py-2.5 font-semibold text-cobalt-ink disabled:opacity-50">Save</button>
        {state.error ? <p role="alert" className="text-flagged">{state.error}</p> : null}
        {state.message ? <p role="status" className="text-verified">{state.message}</p> : null}
      </div>
    </form>
  );
}
