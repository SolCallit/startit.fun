"use client";

import { useState, useTransition, type ReactNode } from "react";
import { motion } from "motion/react";
import { acceptTerms, declineTerms } from "@/lib/legal/actions";

/** Blocks the app for a wallet that hasn't accepted the current Terms of Use. */
export function TermsGate({ updated, children }: { updated: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="tos-title">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[20px] border border-line-strong bg-paper shadow-2xl"
      >
        <header className="border-b border-line px-5 py-4 sm:px-7">
          <h2 id="tos-title" className="text-[1.375rem] text-ink">Startit Website Terms of Use</h2>
          <p className="mt-1 text-[0.875rem] text-muted">Last updated: {updated}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">{children}</div>
        <footer className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:px-7">
          <label className="flex cursor-pointer items-center gap-3 text-[0.9375rem] text-ink-soft">
            <input type="checkbox" role="switch" className="switch" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I have read and agree to the Startit Website Terms of Use.
          </label>
          {err ? <p role="alert" className="text-[0.875rem] text-flagged">{err}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-chrome" disabled={pending} onClick={() => start(() => declineTerms())}>Decline</button>
            <button type="button" className="btn-start" disabled={!agree || pending}
              onClick={() => start(async () => { const r = await acceptTerms(); if (r.error) setErr(r.error); else setOpen(false); })}>
              {pending ? "Saving…" : "Accept"}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
