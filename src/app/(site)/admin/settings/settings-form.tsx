"use client";

import { useActionState } from "react";
import { saveFeeRouter, type SettingsState } from "@/lib/launch/settings-actions";

export function FeeRouterForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveFeeRouter, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fee_router_address" className="font-medium text-ink">Fee Router address</label>
        <p className="text-[0.8125rem] text-muted">The Squads multisig vault that receives LaunchLab platform fees, LP Fee Keys and CPMM creator fees.</p>
        <input id="fee_router_address" name="fee_router_address" defaultValue={current ?? ""} spellCheck={false}
          className="rounded-full border-[1.5px] border-line bg-surface shadow-raise-sm px-3 py-2 font-mono text-[0.875rem] text-ink focus:border-cobalt focus:outline-none" />
      </div>
      <label className="flex items-start gap-3 text-ink-soft">
        <input type="checkbox" name="confirm" className="mt-1 accent-[var(--cobalt)]" />
        I checked this address character by character against the Squads app.
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-cobalt shadow-raise-sm active:translate-y-[2px] active:shadow-none px-4 py-2.5 font-semibold text-cobalt-ink hover:opacity-90 disabled:opacity-50">Save</button>
        {state.error ? <p role="alert" className="text-flagged">{state.error}</p> : null}
        {state.message ? <p role="status" className="text-verified">{state.message}</p> : null}
      </div>
    </form>
  );
}
