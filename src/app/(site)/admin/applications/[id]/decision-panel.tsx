"use client";

import { useActionState, useState } from "react";
import { decide, type DecisionState } from "@/lib/review/actions";
import { STATUS_LABEL, type ApplicationStatus } from "@/lib/domain/status";

type Action = { to: ApplicationStatus; label: string; needsReason: boolean; intent: "primary" | "neutral" | "danger" };

const intentCls = {
  primary: "bg-cobalt text-cobalt-ink border-cobalt",
  neutral: "bg-surface text-ink border-line-strong",
  danger: "bg-surface text-flagged border-flagged/50",
};

export function DecisionPanel({ appId, actions }: { appId: string; actions: Action[] }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decide.bind(null, appId), {});
  const [chosen, setChosen] = useState<Action | null>(null);

  if (!actions.length) return <p className="text-ink-soft">No decisions are available in this state.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a decision">
        {actions.map((a) => (
          <button key={a.to} type="button" onClick={() => setChosen(a)} aria-pressed={chosen?.to === a.to}
            className={`rounded-md border px-3 py-2 text-[0.9375rem] font-semibold ${intentCls[a.intent]} ${chosen?.to === a.to ? "ring-2 ring-cobalt ring-offset-2 ring-offset-surface" : "opacity-90 hover:opacity-100"}`}>
            {a.label}
          </button>
        ))}
      </div>

      {chosen ? (
        <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-paper p-4">
          <input type="hidden" name="to" value={chosen.to} />
          <p className="text-ink">
            Moves the application to <strong>{STATUS_LABEL[chosen.to]}</strong>. This is recorded permanently with your name.
          </p>
          {chosen.to === "approved" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-medium text-ink">Before approving</legend>
              <label className="flex gap-3 text-ink-soft"><input type="checkbox" role="switch" name="confirm_identity" className="switch shrink-0" />I verified the founder&apos;s identity myself, not only from the AI report.</label>
              <label className="flex gap-3 text-ink-soft"><input type="checkbox" role="switch" name="confirm_authorization" className="switch shrink-0" />I confirmed the founder explicitly approved this token and its branding.</label>
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason" className="font-medium text-ink">
              {chosen.to === "evidence_requested" ? "What do you need from the applicant?" : chosen.to === "approved" ? "How did you verify the founder?" : "Reason"}
              {chosen.needsReason ? "" : " (optional)"}
            </label>
            <textarea id="reason" name="reason" rows={3} required={chosen.needsReason}
              className="rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2 text-ink focus:border-cobalt focus:outline-none" />
            {chosen.to === "evidence_requested" ? <p className="text-[0.875rem] text-muted">The applicant sees this message.</p> : null}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending}
              className={`rounded-md border px-4 py-2 font-semibold disabled:opacity-50 ${intentCls[chosen.intent]}`}>
              {pending ? "Recording…" : `Confirm: ${chosen.label}`}
            </button>
            <button type="button" onClick={() => setChosen(null)} className="text-ink-soft hover:text-ink">Cancel</button>
          </div>
        </form>
      ) : null}

      {state.error ? <p role="alert" className="text-flagged">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-verified">{state.message}</p> : null}
    </div>
  );
}
