import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE, type ApplicationStatus, type StatusTone } from "@/lib/domain/status";
import { FINDING_LABEL, type FindingStatus } from "@/lib/domain/findings";

type Intent = "primary" | "neutral" | "danger" | "quiet";

const intentClass: Record<Intent, string> = {
  primary: "bg-cobalt text-cobalt-ink shadow-raise-sm hover:brightness-110 active:translate-y-[2px] active:shadow-none",
  neutral: "bg-surface text-ink border-[1.5px] border-line shadow-raise-sm hover:border-cobalt active:translate-y-[2px] active:shadow-none",
  danger: "bg-surface text-flagged border-[1.5px] border-flagged/50 hover:bg-flagged-soft",
  quiet: "text-cobalt hover:underline underline-offset-4",
};

const quietBase = "inline-flex items-center gap-2 text-[0.9375rem] font-bold disabled:opacity-50";
const base =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] font-bold transition-[transform,box-shadow,filter,border-color] duration-75 disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({ intent = "primary", className = "", ...props }: ComponentProps<"button"> & { intent?: Intent }) {
  return <button className={`${intent === "quiet" ? quietBase : base} ${intentClass[intent]} ${className}`} {...props} />;
}

export function ButtonLink({
  intent = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { intent?: Intent }) {
  return <Link className={`${intent === "quiet" ? quietBase : base} ${intentClass[intent]} ${className}`} {...props} />;
}

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-unverified-soft text-unverified",
  progress: "bg-cobalt-soft text-cobalt",
  attention: "bg-review-soft text-review",
  good: "bg-verified-soft text-verified",
  bad: "bg-flagged-soft text-flagged",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold ${toneClass[STATUS_TONE[status]]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const findingClass: Record<FindingStatus, string> = {
  VERIFIED: "bg-verified-soft text-verified",
  UNVERIFIED: "bg-unverified-soft text-unverified",
  NEEDS_REVIEW: "bg-review-soft text-review",
  FLAGGED: "bg-flagged-soft text-flagged",
};

const findingMark: Record<FindingStatus, string> = { VERIFIED: "✓", UNVERIFIED: "?", NEEDS_REVIEW: "!", FLAGGED: "✕" };

export function FindingBadge({ status }: { status: FindingStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[0.8125rem] font-semibold ${findingClass[status]}`}>
      <span aria-hidden className="font-mono text-xs">{findingMark[status]}</span>
      {FINDING_LABEL[status]}
    </span>
  );
}

/** Machine text: addresses, hashes, IDs. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.85em] break-all ${className}`}>{children}</span>;
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col gap-4 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.02em] text-ink sm:text-[2.5rem]">{title}</h1>
        {lede ? <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-soft">{lede}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      {title ? (
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[1rem] font-semibold text-ink">{title}</h2>
          {aside}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "border-flagged/40 bg-flagged-soft text-flagged"
      : tone === "warn"
        ? "border-review/40 bg-review-soft text-review"
        : "border-cobalt/30 bg-cobalt-soft text-ink";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-4 py-3 text-[0.9375rem] ${cls}`}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-[1.0625rem] font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}
