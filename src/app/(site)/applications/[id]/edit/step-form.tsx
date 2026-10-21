"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { saveStep, uploadEvidence, uploadProjectImage, type StepState } from "@/lib/applications/actions";
import { PairPicker, type PairOption } from "./pair-picker";
import { MAX_STARTER_BUY, PAIR_KINDS, type StepNumber } from "@/lib/applications/schema";

const SOL = "So11111111111111111111111111111111111111112";
const inputCls =
  "w-full rounded-[14px] border border-line-strong/80 bg-surface/70 px-3.5 py-3 text-ink placeholder:text-muted/80 transition-colors focus:border-cobalt focus:bg-surface focus:outline-none aria-[invalid=true]:border-flagged";

export type QuoteOption = PairOption;
type Errors = Record<string, string> | undefined;

function Err({ msg, id }: { msg?: string; id?: string }) {
  return (
    <AnimatePresence initial={false}>
      {msg ? (
        <motion.p id={id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[0.875rem] text-flagged">
          {msg}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

function Field({ name, label, errors, defaultValue, multiline, placeholder, prefix, maxLength, className = "", hint }: {
  name: string; label: string; errors: Errors; defaultValue?: string; multiline?: boolean; placeholder?: string;
  prefix?: string; maxLength?: number; className?: string; hint?: string;
}) {
  const err = errors?.[name];
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={name} className="text-[0.9375rem] font-semibold text-ink">{label}</label>
      {multiline ? (
        <textarea id={name} name={name} rows={4} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength}
          aria-invalid={!!err} aria-describedby={err ? `${name}-err` : undefined} className={inputCls} />
      ) : prefix ? (
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">{prefix}</span>
          <input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength}
            aria-invalid={!!err} aria-describedby={err ? `${name}-err` : undefined} className={`${inputCls} pl-[1.65rem] uppercase`} />
        </div>
      ) : (
        <input id={name} name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength}
          aria-invalid={!!err} aria-describedby={err ? `${name}-err` : undefined} className={inputCls} />
      )}
      {hint && !err ? <p className="text-[0.8125rem] text-muted">{hint}</p> : null}
      <Err msg={err} id={`${name}-err`} />
    </div>
  );
}

/** Toggle switch row. Posts `value` when on, `off` when off. */
function Toggle({ name, label, sub, checked, onChange, value = "on", off = "" }: {
  name: string; label: React.ReactNode; sub?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; value?: string; off?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="font-semibold text-ink">{label}</span>
        {sub ? <span className="mt-0.5 block text-[0.875rem] text-muted">{sub}</span> : null}
      </span>
      <input type="hidden" name={name} value={checked ? value : off} />
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="switch mt-0.5" aria-label={typeof label === "string" ? label : undefined} />
    </label>
  );
}

function Chips({ name, options, value, onChange }: { name: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <label key={v} className="relative cursor-pointer">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
          <span className="relative z-10 block rounded-full border border-line-strong/80 px-3.5 py-1.5 text-[0.9375rem] font-semibold text-ink-soft transition-colors peer-checked:border-transparent peer-checked:text-start-ink peer-focus-visible:outline-2 peer-focus-visible:outline-cobalt">
            {l}
          </span>
          {value === v ? <motion.span layoutId={`chip-${name}`} className="absolute inset-0 rounded-full bg-start" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
        </label>
      ))}
    </div>
  );
}

export function StepForm({ appId, step, defaults, quotes, imageUrl, proofs, quoteMint }: {
  appId: string; step: StepNumber; defaults: Record<string, string>; quotes: QuoteOption[];
  imageUrl: string | null; proofs: { id: string; kb: number; mime: string }[]; quoteMint: string | null;
}) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveStep.bind(null, appId, step), {});
  const e = state.errors;
  const d = { ...defaults, ...state.values };
  const quoteSymbol = quotes.find((q) => q.mint === (quoteMint || SOL))?.symbol ?? "SOL";

  return (
    <motion.form
      action={action}
      noValidate
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="glass flex flex-col gap-7 rounded-[28px] p-5 sm:p-8"
    >
      <AnimatePresence>
        {e?._form ? (
          <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-[14px] border border-flagged/40 bg-flagged-soft px-4 py-3 text-flagged">{e._form}</motion.p>
        ) : null}
      </AnimatePresence>

      {step === 1 ? <CoinStep appId={appId} d={d} e={e} quotes={quotes} imageUrl={imageUrl} proofs={proofs} /> : null}
      {step === 2 ? <FeeStep d={d} e={e} /> : null}
      {step === 3 ? <StarterStep d={d} e={e} symbol={quoteSymbol} /> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-6">
        {step > 1 ? (
          <Link href={`/applications/${appId}/edit?step=${step - 1}`} className="btn-chrome">Back</Link>
        ) : null}
        <motion.button whileTap={{ scale: 0.96 }} type="submit" name="$intent" value="continue" disabled={pending} className="btn-start">
          {pending ? "Saving…" : step === 3 ? "Submit for review" : "Next"}
        </motion.button>
        <button type="submit" name="$intent" value="draft" disabled={pending} className="ml-auto text-[0.9375rem] font-semibold text-muted hover:text-ink">
          Save draft
        </button>
        <span role="status" className="w-full text-right text-[0.875rem] text-verified sm:w-auto">{pending ? "" : state.message}</span>
      </div>
    </motion.form>
  );
}

/* ───────────── Step 1: the coin ───────────── */

function CoinStep({ appId, d, e, quotes, imageUrl, proofs }: {
  appId: string; d: Record<string, string>; e: Errors; quotes: QuoteOption[]; imageUrl: string | null; proofs: { id: string; kb: number; mime: string }[];
}) {
  const [quote, setQuote] = useState(d.quote_mint || SOL);
  const pairOptions: [string, string][] = (quotes.length ? quotes : [{ mint: SOL, symbol: "SOL", name: "Solana" }]).map((q) => [q.mint, q.symbol]);
  return (
    <>
      <div>
        <h1 className="font-display text-[1.875rem] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[2.25rem]">Your coin</h1>
        <p className="mt-1 text-ink-soft">A native meme for a product you believe in, plus proof the builder is in.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-[11rem_1fr]">
        <ImagePicker appId={appId} initial={imageUrl} error={e?.image} />
        <div className="flex flex-col gap-4">
          <MemeNamer d={d} e={e} />
          <Field name="project_summary" label="Description" errors={e} defaultValue={d.project_summary} multiline maxLength={1000}
            placeholder="What the product does and why its community should care." />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-ink">Links</h2>
          <p className="text-[0.8125rem] text-muted">Website, X or GitHub. At least one.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkInput name="website" label="Website" placeholder="https://forge.dev" d={d} e={e} />
          <LinkInput name="x" label="X" placeholder="https://x.com/forge" d={d} e={e} />
          <LinkInput name="github" label="GitHub" placeholder="https://github.com/forge" d={d} e={e} />
          <LinkInput name="telegram" label="Telegram" placeholder="https://t.me/forge" d={d} e={e} />
          <LinkInput name="discord" label="Discord" placeholder="https://discord.gg/forge" d={d} e={e} />
        </div>
      </section>

      <ProofPicker appId={appId} proofs={proofs} error={e?.proof} />

      <InspiredBy d={d} e={e} quotes={quotes} quote={quote} setQuote={setQuote} pairOptions={pairOptions} />
    </>
  );
}

function LinkInput({ name, label, placeholder, d, e }: { name: string; label: string; placeholder: string; d: Record<string, string>; e: Errors }) {
  const err = e?.[name];
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <label htmlFor={name} className="pointer-events-none absolute top-1/2 left-3.5 w-[4.75rem] -translate-y-1/2 text-[0.8125rem] font-semibold text-muted">{label}</label>
        <input id={name} name={name} type="url" defaultValue={d[name]} placeholder={placeholder} aria-invalid={!!err}
          className={`${inputCls} pl-[5.5rem] text-[0.9375rem]`} />
      </div>
      <Err msg={err} />
    </div>
  );
}

export function ImagePicker({ appId, initial, error }: { appId: string; initial: string | null; error?: string }) {
  const [url, setUrl] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    const local = URL.createObjectURL(file);
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadProjectImage(appId, fd);
      if (r.error) { setErr(r.error); URL.revokeObjectURL(local); } else setUrl(local);
    });
  };
  const shown = err ?? error;
  return (
    <div className="flex w-40 flex-col gap-1.5 sm:w-auto">
      <span className="text-[0.9375rem] font-semibold text-ink">Image</span>
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => input.current?.click()}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => { ev.preventDefault(); pick(ev.dataTransfer.files[0]); }}
        className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-[22px] border border-dashed ${shown ? "border-flagged" : "border-line-strong"} bg-surface/60 text-center`}
        aria-label={url ? "Change image" : "Add image"}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="px-4 text-[0.875rem] text-muted">
            <span className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-start text-[1.25rem] font-bold text-start-ink">+</span>
            Drop or pick<br />PNG, JPG, GIF · 2 MB
          </span>
        )}
        {busy ? <span className="absolute inset-0 grid place-items-center bg-paper/70 text-[0.875rem] font-semibold text-ink backdrop-blur-sm">Uploading…</span> : null}
      </motion.button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" tabIndex={-1}
        onChange={(ev) => pick(ev.target.files?.[0])} />
      <Err msg={shown ?? undefined} />
    </div>
  );
}

export function ProofPicker({ appId, proofs, error }: { appId: string; proofs: { id: string; kb: number; mime: string }[]; error?: string }) {
  const [list, setList] = useState(proofs);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("kind", "authorization");
      fd.set("file", file);
      const r = await uploadEvidence(appId, {}, fd);
      if (r.error) setErr(r.error);
      else setList((l) => [...l, { id: crypto.randomUUID(), kb: Math.max(1, Math.round(file.size / 1024)), mime: file.type }]);
    });
  };
  const shown = err ?? error;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-ink">Proof the builder is in</h2>
        <p className="text-[0.8125rem] text-muted">Private. Only reviewers see it.</p>
      </div>
      <motion.div
        whileHover={{ y: -1 }}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => { ev.preventDefault(); pick(ev.dataTransfer.files[0]); }}
        className={`flex flex-wrap items-center gap-3 rounded-[18px] border border-dashed ${shown ? "border-flagged" : "border-line-strong"} bg-surface/50 p-4`}
      >
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-chrome">
          {busy ? "Uploading…" : list.length ? "Add another" : "Upload proof"}
        </button>
        <p className="min-w-0 flex-1 text-[0.875rem] text-ink-soft">
          A screenshot of the builder saying yes, a post from the project&apos;s account, or an email from their domain. PDF or image, 4 MB.
        </p>
        <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" className="sr-only" tabIndex={-1}
          onChange={(ev) => { pick(ev.target.files?.[0]); ev.target.value = ""; }} />
        <AnimatePresence initial={false}>
          {list.map((p, i) => (
            <motion.span key={p.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-verified-soft px-3 py-1 text-[0.8125rem] font-semibold text-verified">
              ✓ Proof {i + 1} · {p.kb} KB
            </motion.span>
          ))}
        </AnimatePresence>
      </motion.div>
      <Err msg={shown ?? undefined} />
    </section>
  );
}

function InspiredBy({ d, e, quotes, quote, setQuote, pairOptions }: {
  d: Record<string, string>; e: Errors; quotes: QuoteOption[]; quote: string; setQuote: (v: string) => void; pairOptions: [string, string][];
}) {
  const [open, setOpen] = useState(!!d.pair_kind || (!!d.quote_mint && d.quote_mint !== SOL));
  const [kind, setKind] = useState(d.pair_kind || (open ? "token" : ""));
  const [official, setOfficial] = useState(d.pair_relationship === "official");
  // Picking a stock or coin as the pair pre-fills it as the inspiration.
  const [prefill, setPrefill] = useState({ name: d.pair_name ?? "", mint: d.pair_mint ?? "", n: 0 });
  const pickQuote = (v: string) => {
    setQuote(v);
    const q = quotes.find((x) => x.mint === v);
    if (q && v !== SOL) { setKind("token"); setPrefill((p) => ({ name: `${q.name} (${q.symbol})`, mint: q.mint, n: p.n + 1 })); }
  };
  const toggle = (v: boolean) => {
    setOpen(v);
    if (!v) { setKind(""); setQuote(SOL); } else if (!kind) setKind("token");
  };
  return (
    <section className="rounded-[18px] border border-line/70 bg-surface/40 p-4">
      <Toggle name="$inspired" label="Inspired by a product?" sub="Pair with inspired stock / coin." checked={open} onChange={toggle} />
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key="open" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-2">
                <span className="text-[0.9375rem] font-semibold text-ink">Pair with</span>
                <PairPicker options={quotes.length ? quotes : [{ mint: SOL, symbol: "SOL", name: "Solana", category: "solana" }]} value={quote} onChange={pickQuote} />
                <p className="text-[0.8125rem] text-muted">
                  What people buy your coin with on the bonding curve; fees are counted in it too.
                  {pairOptions.length <= 1 ? " More stock and coin pairs show up here as Raydium opens them." : ""}
                </p>
                <Err msg={e?.quote_mint} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[0.9375rem] font-semibold text-ink">Inspired by</span>
                <Chips name="pair_kind" value={kind} onChange={setKind} options={Object.entries(PAIR_KINDS).map(([v, l]) => [v, l] as [string, string])} />
              </div>
              <div key={prefill.n} className="grid gap-3 sm:grid-cols-2">
                <Field name="pair_name" label={kind === "person" ? "Their name" : kind === "token" ? "Stock or coin" : "Product"} errors={e} defaultValue={prefill.name}
                  placeholder={kind === "person" ? "Andrej Karpathy" : kind === "token" ? "SP500 xStock (SPYx)" : "Hugging Face"} />
                {kind === "token" ? (
                  <Field name="pair_mint" label="Mint address" errors={e} defaultValue={prefill.mint} />
                ) : (
                  <><input type="hidden" name="pair_mint" value="" /><Field name="pair_url" label="Link (optional)" errors={e} defaultValue={d.pair_url} placeholder="https://" /></>
                )}
              </div>
              {kind === "token" ? <input type="hidden" name="pair_url" value={d.pair_url ?? ""} /> : null}
              <Field name="pair_reason" label="The connection" errors={e} defaultValue={d.pair_reason} placeholder="Built on their model, a fan project, …" />
              <Toggle name="pair_relationship" value="official" off="inspired_by" checked={official} onChange={setOfficial}
                label="Official partner" sub="Only if they agreed. You'll need to show proof. Otherwise it's shown as a reference, not an endorsement." />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {!open ? (
        <>
          <input type="hidden" name="quote_mint" value={SOL} />
          {["pair_kind", "pair_name", "pair_mint", "pair_url", "pair_relationship", "pair_reason"].map((n) => <input key={n} type="hidden" name={n} value="" />)}
        </>
      ) : null}
    </section>
  );
}

/* ───────────── Meme names ───────────── */

const MEME_SUFFIX = [
  { t: "INU", n: "Inu" }, { t: "CAT", n: "Cat" }, { t: "PEPE", n: "Pepe" }, { t: "WIF", n: "Wif Hat" },
  { t: "APE", n: "Ape" }, { t: "FROG", n: "Frog" }, { t: "DOGE", n: "Doge" }, { t: "BONK", n: "Bonk" },
];

/** Product name, coin name and ticker, with one-tap meme versions so the coin doesn't look like a corporate token. */
function MemeNamer({ d, e }: { d: Record<string, string>; e: Errors }) {
  const [product, setProduct] = useState(d.project_name ?? "");
  const [coin, setCoin] = useState(d.token_name || d.project_name || "");
  const [ticker, setTicker] = useState(d.ticker ?? "");
  const [coinTouched, setCoinTouched] = useState(!!d.token_name && d.token_name !== d.project_name);
  const word = product.trim().split(/\s+/)[0] ?? "";
  const base = word.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pretty = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  const ideas = base.length >= 2
    ? MEME_SUFFIX.map((m) => {
        const stem = base.slice(0, Math.min(5, 10 - m.t.length));
        return { ticker: stem + m.t, name: `${pretty.slice(0, stem.length)} ${m.n}`.slice(0, 32) };
      })
    : [];
  const input = (name: string, value: string, set: (v: string) => void, extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <input id={name} name={name} value={value} onChange={(ev) => set(ev.target.value)} aria-invalid={!!e?.[name]} className={inputCls} {...extra} />
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="project_name" className="text-[0.9375rem] font-semibold text-ink">Product or brand</label>
        {input("project_name", product, (v) => { setProduct(v); if (!coinTouched) setCoin(v); }, { placeholder: "Predarena", maxLength: 32 })}
        <Err msg={e?.project_name} />
      </div>
      <div className="grid grid-cols-[1fr_8.5rem] gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="token_name" className="text-[0.9375rem] font-semibold text-ink">Coin name</label>
          {input("token_name", coin, (v) => { setCoin(v); setCoinTouched(true); }, { placeholder: "Preda Inu", maxLength: 32 })}
          <Err msg={e?.token_name} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ticker" className="text-[0.9375rem] font-semibold text-ink">Ticker</label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">$</span>
            {input("ticker", ticker, (v) => setTicker(v.toUpperCase().replace(/[^A-Z0-9]/g, "")), { placeholder: "PREDAINU", maxLength: 10, className: `${inputCls} pl-[1.65rem] uppercase` })}
          </div>
          <Err msg={e?.ticker} />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {ideas.length ? (
          <motion.div key="ideas" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-[16px] border border-dashed border-start/50 bg-start/5 p-3">
              <p className="text-[0.8125rem] font-semibold text-ink">Make it memeable <span className="font-normal text-muted">· tap one, or keep your own</span></p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ideas.map((i) => (
                  <motion.button key={i.ticker} type="button" whileTap={{ scale: 0.9 }} whileHover={{ y: -2 }}
                    onClick={() => { setTicker(i.ticker); setCoin(i.name); setCoinTouched(true); }}
                    className={`rounded-full border px-3 py-1 text-[0.8125rem] font-bold ${ticker === i.ticker ? "border-start bg-start text-start-ink" : "border-line-strong/80 bg-surface/60 text-ink-soft hover:text-ink"}`}>
                    ${i.ticker}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ───────────── Step 2: fees ───────────── */

const SPLITS = {
  backer: { c: 5000, f: 3000, l: 500, p: 1500 },
  team: { c: 5000, f: 3000, l: 0, p: 2000 },
};

function FeeStep({ d, e }: { d: Record<string, string>; e: Errors }) {
  const [team, setTeam] = useState(d.applicant_is_founder === "yes");
  const preset = team ? SPLITS.team : SPLITS.backer;
  const n = (v: string | undefined, fb: number) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? fb : Number(v));
  const [s, setS] = useState({ c: n(d.proposed_community_bps, preset.c), f: n(d.proposed_founder_bps, preset.f), l: n(d.proposed_launcher_bps, preset.l), p: n(d.proposed_platform_bps, preset.p) });
  const isPreset = s.c === preset.c && s.f === preset.f && s.l === preset.l && s.p === preset.p;
  const [custom, setCustom] = useState(!isPreset);
  const total = s.c + s.f + s.l + s.p;

  const setTeamAndReset = (v: boolean) => { setTeam(v); setCustom(false); setS(v ? SPLITS.team : SPLITS.backer); };
  const parts = [
    { k: "c" as const, label: "Community", sub: "Public treasury wallet", cls: "bg-cobalt text-cobalt-ink" },
    { k: "f" as const, label: "Builder", sub: "The team behind the product", cls: "bg-start text-start-ink" },
    { k: "l" as const, label: "You", sub: "For bringing it here", cls: "bg-review text-paper" },
    { k: "p" as const, label: "Startit", sub: "Screening, security, ops", cls: "bg-line-strong text-ink" },
  ].filter((x) => !(team && x.k === "l"));

  return (
    <>
      <div>
        <h1 className="font-display text-[1.875rem] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[2.25rem]">Fees</h1>
        <p className="mt-1 text-ink-soft">How trading fees Startit actually collects get shared. Volume isn&apos;t revenue; only collected fees are split.</p>
      </div>

      <Toggle name="applicant_is_founder" value="yes" off="no" checked={team} onChange={setTeamAndReset}
        label="I'm on the builder's team" sub="Then there's no separate launcher cut, and Startit takes 20%." />

      <div className="flex flex-col gap-4">
        <div className="flex h-16 overflow-hidden rounded-[18px] text-[0.9375rem] font-bold shadow-raise" role="img"
          aria-label={parts.map((x) => `${x.label} ${s[x.k] / 100}%`).join(", ")}>
          {parts.map((x) => (
            <motion.div key={x.k} layout className={`flex min-w-0 items-center overflow-hidden px-3 ${x.cls}`}
              animate={{ flexGrow: Math.max(s[x.k], 1) }} style={{ flexBasis: 0 }} transition={{ type: "spring", stiffness: 220, damping: 28 }}>
              <span className="truncate">{s[x.k] / 100}%</span>
            </motion.div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {parts.map((x) => (
            <div key={x.k} className="rounded-[14px] bg-surface/50 p-3">
              <dt className="flex items-center gap-2 font-semibold text-ink"><span className={`size-2.5 rounded-full ${x.cls.split(" ")[0]}`} />{x.label}</dt>
              <dd className="mt-0.5 text-[0.8125rem] text-muted">{x.sub}</dd>
              {custom ? (
                <input type="number" min={0} max={100} step={0.5} value={s[x.k] / 100} aria-label={`${x.label} percent`}
                  onChange={(ev) => setS((o) => ({ ...o, [x.k]: Math.round(Number(ev.target.value) * 100) }))}
                  className="mt-2 w-full rounded-[10px] border border-line-strong bg-surface px-2 py-1.5 text-right text-ink focus:border-cobalt focus:outline-none" />
              ) : null}
            </div>
          ))}
        </dl>
      </div>

      <input type="hidden" name="proposed_community_bps" value={s.c} />
      <input type="hidden" name="proposed_founder_bps" value={s.f} />
      <input type="hidden" name="proposed_launcher_bps" value={team ? 0 : s.l} />
      <input type="hidden" name="proposed_platform_bps" value={s.p} />

      <Toggle name="$custom" label="Custom split" sub="Needs a reason, and a reviewer has to approve it before launch."
        checked={custom} onChange={(v) => { setCustom(v); if (!v) setS(preset); }} />
      <AnimatePresence initial={false}>
        {custom ? (
          <motion.div key="custom" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-3">
              <p className={`font-semibold ${total === 10000 ? "text-verified" : "text-flagged"}`} aria-live="polite">
                Total {total / 100}%{total === 10000 ? "" : ". Has to be exactly 100%."}
              </p>
              <Field name="split_reason" label="Why this split?" errors={e} defaultValue={d.split_reason} placeholder="The builder is funding liquidity, …" />
            </div>
          </motion.div>
        ) : <input key="no-reason" type="hidden" name="split_reason" value="" />}
      </AnimatePresence>
      <Err msg={e?.proposed_community_bps ?? e?.proposed_launcher_bps} />
    </>
  );
}

/* ───────────── Step 3: starter's buy ───────────── */

function StarterStep({ d, e, symbol }: { d: Record<string, string>; e: Errors; symbol: string }) {
  const [amount, setAmount] = useState(d.starter_buy_amount ?? "");
  const [agree, setAgree] = useState(d.ack_terms === "on");
  const presets = ["0", "0.5", "1", "2", "5"];
  return (
    <>
      <div>
        <h1 className="font-display text-[1.875rem] leading-tight font-extrabold tracking-[-0.02em] text-ink sm:text-[2.25rem]">
          Starter&apos;s buy <span className="text-[1rem] font-semibold text-muted">optional</span>
        </h1>
        <p className="mt-1 text-ink-soft">
          Like a creator&apos;s buy: you get in right after launch, from your own wallet. It&apos;s shown on the project page so
          everyone knows. Leave it at 0 to skip.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="starter_buy_amount" className="font-semibold text-ink">Amount</label>
        <div className="relative max-w-xs">
          <input id="starter_buy_amount" name="starter_buy_amount" inputMode="decimal" value={amount} placeholder="0"
            onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9.]/g, ""))} aria-invalid={!!e?.starter_buy_amount}
            className={`${inputCls} pr-16 font-display text-[1.75rem] font-extrabold`} />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-bold text-muted">{symbol}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <motion.button key={p} type="button" whileTap={{ scale: 0.92 }} onClick={() => setAmount(p === "0" ? "" : p)}
              className={`rounded-full border px-3.5 py-1.5 text-[0.9375rem] font-semibold ${(amount || "0") === p ? "border-start bg-start text-start-ink" : "border-line-strong/80 text-ink-soft hover:text-ink"}`}>
              {p === "0" ? "Skip" : `${p} ${symbol}`}
            </motion.button>
          ))}
        </div>
        <p className="text-[0.8125rem] text-muted">Up to {MAX_STARTER_BUY} {symbol}. It runs as its own transaction right after the launch confirms, so it isn&apos;t guaranteed to be the very first buy.</p>
        <Err msg={e?.starter_buy_amount} />
      </div>

      <div className="rounded-[18px] border border-line/70 bg-surface/40 p-4">
        <Toggle name="ack_terms" checked={agree} onChange={setAgree}
          label="I agree to the terms"
          sub={<>No price promises, the builder&apos;s approval doesn&apos;t make them the owner, everything gets published before launch, and what I sent is accurate. <Link href="/terms" className="font-semibold text-cobalt underline-offset-4 hover:underline" target="_blank">Read them</Link>.</>} />
        <Err msg={e?.ack_terms} />
      </div>
    </>
  );
}
