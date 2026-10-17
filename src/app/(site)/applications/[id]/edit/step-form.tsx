"use client";

import { useActionState, useState } from "react";
import { saveStep, uploadEvidence, type StepState, type UploadState } from "@/lib/applications/actions";
import { PAIR_KINDS, PAIR_RELATIONSHIPS, type StepNumber } from "@/lib/applications/schema";

const inputCls =
  "w-full rounded-md border bg-surface px-3 py-2.5 text-ink placeholder:text-muted focus:outline-none aria-[invalid=true]:border-flagged border-line-strong focus:border-cobalt";

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  errors?: Record<string, string>;
  type?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  autoComplete?: string;
};

function Field({ name, label, hint, defaultValue, errors, type = "text", multiline, rows = 4, placeholder, autoComplete }: FieldProps) {
  const err = errors?.[name];
  const describedBy = [hint ? `${name}-hint` : null, err ? `${name}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="font-medium text-ink">{label}</label>
      {hint ? <p id={`${name}-hint`} className="text-[0.875rem] text-muted">{hint}</p> : null}
      {multiline ? (
        <textarea id={name} name={name} rows={rows} defaultValue={defaultValue} placeholder={placeholder}
          aria-invalid={!!err} aria-describedby={describedBy} className={inputCls} />
      ) : (
        <input id={name} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} autoComplete={autoComplete}
          aria-invalid={!!err} aria-describedby={describedBy} className={inputCls} />
      )}
      {err ? <p id={`${name}-err`} className="text-[0.875rem] text-flagged">{err}</p> : null}
    </div>
  );
}

function Check({ name, label, errors, values }: { name: string; label: string; errors?: Record<string, string>; values?: Record<string, string> }) {
  const err = errors?.[name];
  return (
    <div>
      <label className="flex cursor-pointer items-start justify-between gap-4 text-ink-soft">
        <span>{label}</span>
        <input type="checkbox" role="switch" name={name} defaultChecked={values?.[name] === "on"} className="switch mt-0.5" aria-invalid={!!err} />
      </label>
      {err ? <p className="mt-1 text-[0.875rem] text-flagged">{err}</p> : null}
    </div>
  );
}

/** Segmented toggle: radio inputs drawn as a row of toggle buttons. */
function Segmented({ name, options, value, onChange }: { name: string; options: [string, string][]; value: string; onChange?: (v: string) => void }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1 rounded-full border-[1.5px] border-line-strong bg-surface p-1">
      {options.map(([v, l]) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange?.(v)} className="peer sr-only" />
          <span className="block rounded-full px-3.5 py-1.5 text-[0.9375rem] font-semibold text-ink-soft peer-checked:bg-surface-2 peer-checked:text-ink peer-checked:shadow-raise-sm peer-focus-visible:outline-2 peer-focus-visible:outline-cobalt">
            {l}
          </span>
        </label>
      ))}
    </div>
  );
}

export type QuoteOption = { mint: string; symbol: string; name: string };

export function StepForm({ appId, step, defaults, quotes = [] }: { appId: string; step: StepNumber; defaults: Record<string, string>; quotes?: QuoteOption[] }) {
  const [state, action, pending] = useActionState<StepState, FormData>(saveStep.bind(null, appId, step), {});
  const e = state.errors;
  const d = { ...defaults, ...state.values };

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {e?._form ? <p role="alert" className="rounded-md border border-flagged/40 bg-flagged-soft px-4 py-3 text-flagged">{e._form}</p> : null}

      {step === 1 && (
        <>
          <Field name="applicant_name" label="Your full name" defaultValue={d.applicant_name} errors={e} autoComplete="name" />
          <Field name="contact_email" label="Contact email" type="email" defaultValue={d.contact_email} errors={e} autoComplete="email"
            hint="Use an address on the company's domain if you can. It helps us verify you." />
          <div className="flex flex-col gap-1.5">
            <input type="hidden" name="applicant_is_founder" value="no" />
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="font-medium text-ink">I&apos;m a founder of this startup</span>
                <span className="block text-[0.875rem] text-muted">
                  Switch off if you found the startup and are launching with the founder&apos;s written approval. Launchers earn 5% of collected trading fees.
                </span>
              </span>
              <input type="checkbox" role="switch" name="applicant_is_founder" value="yes" defaultChecked={d.applicant_is_founder !== "no"} className="switch mt-0.5" />
            </label>
            {e?.applicant_is_founder ? <p className="text-[0.875rem] text-flagged">{e.applicant_is_founder}</p> : null}
          </div>
          <Field name="applicant_role" label="Your role" defaultValue={d.applicant_role} errors={e}
            placeholder="Co-founder and CEO" hint="If you aren't the founder, say how you know the team and how they authorized you." />
        </>
      )}

      {step === 2 && (
        <>
          <Field name="project_name" label="Project or startup name" defaultValue={d.project_name} errors={e} />
          <Field name="project_summary" label="What does the product do?" multiline rows={5} defaultValue={d.project_summary} errors={e}
            hint="Plain language. Who uses it, what it does, and what stage it's at." />
          <Field name="website" label="Official website" type="url" defaultValue={d.website} errors={e} placeholder="https://" />
          <Field name="x" label="Official X account" type="url" defaultValue={d.x} errors={e} placeholder="https://x.com/yourproject" />
          <Field name="github" label="GitHub organization or repository" type="url" defaultValue={d.github} errors={e} placeholder="https://github.com/yourorg" />
          <Field name="docs" label="Documentation (optional)" type="url" defaultValue={d.docs} errors={e} />
          <Field name="demo" label="Demo or live product (optional)" type="url" defaultValue={d.demo} errors={e} />
          <Field name="other_social" label="Other official account (optional)" type="url" defaultValue={d.other_social} errors={e}
            hint="Discord, Telegram or LinkedIn, whichever the company uses most." />
        </>
      )}

      {step === 3 && (
        <>
          <Field name="founder_approval_statement" label="Written approval from the founder" multiline rows={6} defaultValue={d.founder_approval_statement} errors={e}
            hint="In the founder's own words: that they approve a community token for this product, its proposed name and ticker, and Startit's role." />
          <Field name="permitted_branding" label="Branding the token may use" multiline rows={3} defaultValue={d.permitted_branding} errors={e}
            hint="For example: the product name and logo, but not the company's legal name." />
        </>
      )}

      {step === 4 && (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field name="token_name" label="Token name" defaultValue={d.token_name} errors={e} />
            <Field name="ticker" label="Ticker" defaultValue={d.ticker} errors={e} placeholder="FORGE" hint="2–10 letters or numbers." />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="font-medium text-ink">Blockchain</p>
            <p className="rounded-md border border-line bg-paper px-3 py-2.5 text-ink-soft">Solana, launched through Raydium LaunchLab</p>
          </div>
          <Field name="token_concept" label="Token concept" multiline defaultValue={d.token_concept} errors={e}
            hint="What the meme is and how it connects to the product. Don't describe expected price or returns." />
          <Field name="milestones" label="Upcoming product milestones" multiline defaultValue={d.milestones} errors={e}
            hint="One per line: model releases, features, integrations. These are shared as plans, not promises." />
          <Field name="community_plan" label="How you'll work with the community" multiline defaultValue={d.community_plan} errors={e} />
          <QuotePicker quotes={quotes} value={d.quote_mint} errors={e} />
          <PairFields defaults={d} errors={e} />
        </>
      )}

      {step === 5 && <FeeFields defaults={d} errors={e} />}

      {step === 6 && (
        <>
          <Field name="insider_allocation_disclosure" label="Insider holdings and allocations" multiline rows={4} defaultValue={d.insider_allocation_disclosure} errors={e}
            hint="Any tokens the founder, team, advisors or Startit will hold or receive at launch. Write “None” if there are none." />
          <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-5">
            <legend className="px-1 font-medium text-ink">Before you submit</legend>
            <Check name="ack_no_returns" errors={e} values={d} label="We won't promise or imply price appreciation, and milestones aren't guarantees of token returns." />
            <Check name="ack_not_ownership" errors={e} values={d} label="I understand founder approval doesn't make the founder the token's owner or controller." />
            <Check name="ack_disclosure" errors={e} values={d} label="Supply, authorities, treasury controls, allocations and the fee split will be published before launch." />
            <Check name="ack_accurate" errors={e} values={d} label="Everything in this application is accurate, and I'm authorized to submit it." />
          </fieldset>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button type="submit" name="$intent" value="continue" disabled={pending}
          className="btn-start">
          {step === 6 ? "Submit application" : "Save and continue"}
        </button>
        <button type="submit" name="$intent" value="draft" disabled={pending}
          className="btn-chrome">
          Save draft
        </button>
        <span role="status" className="text-[0.9375rem] text-verified">{pending ? "" : state.message}</span>
      </div>
    </form>
  );
}

/** The on-chain pair: the token your bonding curve trades against. */
function QuotePicker({ quotes, value, errors }: { quotes: QuoteOption[]; value?: string; errors?: Record<string, string> }) {
  const sol = "So11111111111111111111111111111111111111112";
  const [v, setV] = useState(value || sol);
  const options: [string, string][] = (quotes.length ? quotes : [{ mint: sol, symbol: "SOL", name: "Solana" }]).map((q) => [q.mint, q.symbol]);
  const picked = quotes.find((q) => q.mint === v);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-ink">Paired with</p>
      <p className="text-[0.875rem] text-muted">
        The token people buy yours with on the bonding curve. Graduation targets and trading fees are counted in it.
      </p>
      <Segmented name="quote_mint" value={v} onChange={setV} options={options} />
      {picked && picked.mint !== sol ? <p className="text-[0.875rem] text-ink-soft">{picked.name}: fees for your token will be collected and paid in {picked.symbol}.</p> : null}
      {errors?.quote_mint ? <p className="text-[0.875rem] text-flagged">{errors.quote_mint}</p> : null}
    </div>
  );
}

function PairFields({ defaults, errors }: { defaults: Record<string, string>; errors?: Record<string, string> }) {
  const [kind, setKind] = useState(defaults.pair_kind ?? "");
  return (
    <fieldset className="flex flex-col gap-5 rounded-[18px] border border-line bg-paper p-5">
      <legend className="px-1 font-semibold text-ink">Inspired by <span className="font-normal text-muted">(optional)</span></legend>
      <p className="-mt-2 text-[0.9375rem] text-ink-soft">
        A token, project or person your product looks up to: the model it builds on, the lab behind it, a founder who shaped it.
        It shows as <span className="font-semibold text-ink">Inspired by …</span> on your project page. We check it like any other claim,
        and it never implies their endorsement unless you mark it official and prove it.
      </p>
      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-ink">Inspired by</p>
        <Segmented name="pair_kind" value={kind} onChange={setKind}
          options={[["", "None"], ...Object.entries(PAIR_KINDS).map(([v, l]) => [v, l] as [string, string])]} />
      </div>
      {kind ? (
        <>
          <Field name="pair_name" label={kind === "person" ? "Their name" : kind === "token" ? "Token name" : "Project or company name"}
            defaultValue={defaults.pair_name} errors={errors} placeholder={kind === "person" ? "Andrej Karpathy" : kind === "token" ? "Jupiter (JUP)" : "Hugging Face"} />
          {kind === "token" ? (
            <Field name="pair_mint" label="Token mint address" defaultValue={defaults.pair_mint} errors={errors}
              hint="The Solana mint, so people can check which token you mean." />
          ) : (
            <input type="hidden" name="pair_mint" value="" />
          )}
          <Field name="pair_url" label="Official link (optional)" type="url" defaultValue={defaults.pair_url} errors={errors} placeholder="https://" />
          <div className="flex flex-col gap-1.5">
            <input type="hidden" name="pair_relationship" value="inspired_by" />
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="font-medium text-ink">Official partner</span>
                <span className="block text-[0.875rem] text-muted">
                  {PAIR_RELATIONSHIPS.official}. Leave off for a reference: {PAIR_RELATIONSHIPS.inspired_by.toLowerCase()}.
                </span>
              </span>
              <input type="checkbox" role="switch" name="pair_relationship" value="official" defaultChecked={defaults.pair_relationship === "official"} className="switch mt-0.5" />
            </label>
            {errors?.pair_relationship ? <p className="text-[0.875rem] text-flagged">{errors.pair_relationship}</p> : null}
          </div>
          <Field name="pair_reason" label="Why this pairing?" multiline rows={3} defaultValue={defaults.pair_reason} errors={errors}
            hint={kind === "person"
              ? "How your product relates to their work. Don't use their name or image in your token's name, ticker or branding unless they've officially agreed."
              : "How your product relates to it, in a sentence or two."} />
        </>
      ) : (
        ["pair_name", "pair_mint", "pair_url", "pair_relationship", "pair_reason"].map((n) => <input key={n} type="hidden" name={n} value="" />)
      )}
    </fieldset>
  );
}

function FeeFields({ defaults, errors }: { defaults: Record<string, string>; errors?: Record<string, string> }) {
  const isFounder = defaults.applicant_is_founder === "yes";
  const num = (v: string | undefined, fallback: number) => (v === undefined || v === "" ? fallback : Number(v));
  const [p, setP] = useState(num(defaults.proposed_platform_bps, isFounder ? 2000 : 1500));
  const [f, setF] = useState(num(defaults.proposed_founder_bps, 3000));
  const [l, setL] = useState(isFounder ? 0 : num(defaults.proposed_launcher_bps, 500));
  const [c, setC] = useState(num(defaults.proposed_community_bps, 5000));
  const total = p + f + l + c;
  const isDefault = isFounder ? p === 2000 && f === 3000 && l === 0 && c === 5000 : p === 1500 && f === 3000 && l === 500 && c === 5000;
  const pct = (n: number) => (Number.isFinite(n) ? n / 100 : 0);

  const row = (label: string, name: string, v: number, set: (n: number) => void, hint: string) => (
    <div className="grid grid-cols-[1fr_7rem] items-center gap-4">
      <label htmlFor={name}>
        <span className="font-medium text-ink">{label}</span>
        <span className="block text-[0.875rem] text-muted">{hint}</span>
      </label>
      <div className="flex items-center gap-1.5">
        <input id={name} type="number" min={0} max={100} step={0.01} value={pct(v)}
          onChange={(ev) => set(Math.round(Number(ev.target.value) * 100))}
          className="w-full rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2 text-right text-ink focus:border-cobalt focus:outline-none" />
        <span className="text-muted">%</span>
        <input type="hidden" name={name} value={v} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="applicant_is_founder" value={defaults.applicant_is_founder ?? ""} />
      <p className="text-ink-soft">
        These shares apply to trading fees Startit actually collects, not to trading volume.{" "}
        {isFounder
          ? "Because you're the founder, there's no separate launcher share: the default is 50% community, 30% founder and 20% platform."
          : "The default is 50% community, 30% founder, 5% to you as launcher and 15% platform."}{" "}
        A different split needs a reason and must be approved before launch.
      </p>
      {row("Community treasury", "proposed_community_bps", c, setC, "Held in a published wallet with disclosed controls")}
      {row("Founder", "proposed_founder_bps", f, setF, "Paid to the founder's wallet")}
      {isFounder ? <input type="hidden" name="proposed_launcher_bps" value={0} /> :
        row("Launcher (you)", "proposed_launcher_bps", l, setL, "Paid to your wallet after launch")}
      {row("Platform", "proposed_platform_bps", p, setP, "Startit operations, screening and security")}
      <p className={`text-[0.9375rem] font-semibold ${total === 10000 ? "text-verified" : "text-flagged"}`} aria-live="polite">
        Total: {total / 100}%{total === 10000 ? "" : ". It must be exactly 100%."}
      </p>
      {errors?.proposed_community_bps ? <p className="text-[0.875rem] text-flagged">{errors.proposed_community_bps}</p> : null}
      {errors?.proposed_launcher_bps ? <p className="text-[0.875rem] text-flagged">{errors.proposed_launcher_bps}</p> : null}
      {!isDefault ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="split_reason" className="font-medium text-ink">Why a different split?</label>
          <textarea id="split_reason" name="split_reason" rows={3} defaultValue={defaults.split_reason}
            className="w-full rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-ink focus:border-cobalt focus:outline-none" />
          {errors?.split_reason ? <p className="text-[0.875rem] text-flagged">{errors.split_reason}</p> : null}
        </div>
      ) : (
        <input type="hidden" name="split_reason" value="" />
      )}
    </div>
  );
}

export function EvidenceUploader({ appId }: { appId: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadEvidence.bind(null, appId), {});
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="kind" className="font-medium text-ink">What does this file show?</label>
        <select id="kind" name="kind" defaultValue="authorization"
          className="rounded-[12px] border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-ink focus:border-cobalt focus:outline-none">
          <option value="authorization">Proof I&apos;m authorized to represent the company</option>
          <option value="founder_approval">Signed founder approval letter</option>
          <option value="identity">Founder identity</option>
          <option value="other">Other supporting evidence</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="font-medium text-ink">File</label>
        <input id="file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
          className="text-ink-soft file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:font-semibold file:text-ink" />
        <p className="text-[0.875rem] text-muted">PDF, image or text, up to 4 MB. Files are stored privately and only Startit reviewers can open them.</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="btn-chrome">
          {pending ? "Uploading…" : "Upload file"}
        </button>
        {state.error ? <p role="alert" className="text-[0.9375rem] text-flagged">{state.error}</p> : null}
        {state.message ? <p role="status" className="text-[0.9375rem] text-verified">{state.message}</p> : null}
      </div>
    </form>
  );
}
