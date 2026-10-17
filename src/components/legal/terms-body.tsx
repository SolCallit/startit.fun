import { TERMS_PREAMBLE, TERMS_SECTIONS } from "@/lib/legal/terms-of-use";

export function TermsBody({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      {TERMS_PREAMBLE.map((p) => (
        <p key={p.slice(0, 24)} className="mb-4 text-[0.875rem] leading-relaxed font-semibold tracking-[0.01em] text-ink">{p}</p>
      ))}
      {TERMS_SECTIONS.map((s) => (
        <section key={s.title} className="mt-6">
          <h3 className="text-[1rem] font-bold text-ink">{s.title}</h3>
          {s.body.map((p) => <p key={p.slice(0, 32)} className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{p}</p>)}
        </section>
      ))}
    </div>
  );
}
