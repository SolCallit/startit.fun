import { z } from "zod";
import { isDefaultSplit, validateSplit } from "@/lib/domain/fees";

/** Three screens, pump.fun style: the coin, the fee split, then an optional starter's buy. */
export const STEPS = [
  { n: 1, title: "Your coin", covers: "Name, ticker, what it is, links, the brand's proof and an image" },
  { n: 2, title: "Fees", covers: "Who gets what from collected trading fees" },
  { n: 3, title: "Starter's buy", covers: "Buy in right after launch, if you want to" },
] as const;
export type StepNumber = (typeof STEPS)[number]["n"];
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_STARTER_BUY = 25;
export const EVIDENCE_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"] as const;

const trimmed = (max: number) => z.string().trim().max(max);
const required = (label: string, max: number) => trimmed(max).min(1, `${label} is required.`);

/** HTTPS URL, optionally pinned to a set of hostnames (and their subdomains). */
export function httpsUrl(label: string, hosts?: string[]) {
  return z
    .string()
    .trim()
    .max(2048)
    .refine((v) => {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" || u.username || u.password) return false;
        if (!hosts) return true;
        const h = u.hostname.toLowerCase();
        return hosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
      } catch {
        return false;
      }
    }, hosts ? `${label} must be an https:// link on ${hosts.join(" or ")}.` : `${label} must be a full https:// link.`);
}

const optionalUrl = (label: string, hosts?: string[]) => z.union([z.literal(""), httpsUrl(label, hosts)]);

/** "Paired with" — optional link to a related token, project or person. Informational; screened like any claim. */
export const PAIR_KINDS = { token: "Stock / coin", project: "Product", person: "Person" } as const;
export const PAIR_RELATIONSHIPS = {
  inspired_by: "Inspired by / related to — no affiliation or endorsement",
  official: "Official partner — they've agreed, and I'll upload proof",
} as const;

const pairFields = {
  pair_kind: z.enum(["", "token", "project", "person"]).default(""),
  pair_name: trimmed(80).default(""),
  pair_relationship: z.enum(["", "inspired_by", "official"]).default(""),
  pair_reason: trimmed(600).default(""),
  pair_url: optionalUrl("Pair link").default(""),
  pair_mint: z.union([z.literal(""), z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Enter the token's Solana mint address.")]).default(""),
};

function checkPair(v: { pair_kind: string; pair_name: string; pair_relationship: string; pair_reason: string; pair_mint: string }, ctx: z.RefinementCtx) {
  if (!v.pair_kind) return;
  if (!v.pair_name) ctx.addIssue({ code: "custom", message: "Name what you're pairing with.", path: ["pair_name"] });
  if (!v.pair_relationship) ctx.addIssue({ code: "custom", message: "Say how the project relates to it.", path: ["pair_relationship"] });
  if (!v.pair_reason) ctx.addIssue({ code: "custom", message: "Explain the connection in a sentence or two.", path: ["pair_reason"] });
  if (v.pair_kind === "token" && !v.pair_mint) ctx.addIssue({ code: "custom", message: "A token pairing needs the token's mint address.", path: ["pair_mint"] });
}

const feeSplit = z
  .object({
    applicant_is_founder: z.enum(["yes", "no"]).optional(),
    proposed_platform_bps: z.coerce.number().int(),
    proposed_founder_bps: z.coerce.number().int(),
    proposed_launcher_bps: z.coerce.number().int(),
    proposed_community_bps: z.coerce.number().int(),
    split_reason: trimmed(1000),
  })
  .superRefine((v, ctx) => {
    const split = { platformBps: v.proposed_platform_bps, founderBps: v.proposed_founder_bps, launcherBps: v.proposed_launcher_bps, communityBps: v.proposed_community_bps };
    const r = validateSplit(split);
    if (!r.ok) ctx.addIssue({ code: "custom", message: r.error, path: ["proposed_community_bps"] });
    if (v.applicant_is_founder === "yes" && v.proposed_launcher_bps !== 0) {
      ctx.addIssue({ code: "custom", message: "You're on the team, so there's no separate starter share.", path: ["proposed_launcher_bps"] });
    }
    if (!isDefaultSplit(split) && !v.split_reason) ctx.addIssue({ code: "custom", message: "Say why you want a different split.", path: ["split_reason"] });
  });

export const stepSchemas = {
  1: z
    .object({
      project_name: required("Product or brand", 32),
      token_name: trimmed(32).default(""),
      ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "Ticker is 2–10 letters or numbers."),
      project_summary: required("Description", 1000),
      website: optionalUrl("Website"),
      x: optionalUrl("X link", ["x.com", "twitter.com"]),
      github: optionalUrl("GitHub link", ["github.com"]),
      telegram: optionalUrl("Telegram link", ["t.me", "telegram.me"]),
      discord: optionalUrl("Discord link", ["discord.gg", "discord.com"]),
      quote_mint: z.union([z.literal(""), z.string().trim().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Pick a pair from the list.")]).default(""),
      ...pairFields,
    })
    .superRefine((v, ctx) => {
      if (!v.website && !v.x && !v.github) ctx.addIssue({ code: "custom", message: "Add at least the website, X or GitHub.", path: ["website"] });
      checkPair(v, ctx);
    }),
  2: feeSplit,
  3: z.object({
    starter_buy_amount: z.preprocess((v) => (v === "" || v === undefined ? 0 : v), z.coerce.number().min(0, "Can't be negative.").max(MAX_STARTER_BUY, `Up to ${MAX_STARTER_BUY}.`)),
    ack_terms: z.literal("on", { error: "Agree to the terms to submit." }),
  }),
} satisfies Record<StepNumber, z.ZodType>;

export type FieldErrors = Record<string, string>;

export function flattenErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Parses one step. `strict=false` (Save draft) only reports errors on fields the user filled in. */
export function parseStep<N extends StepNumber>(step: N, raw: Record<string, string>, strict: boolean) {
  const res = stepSchemas[step].safeParse(raw);
  if (res.success) return { ok: true as const, data: res.data as z.infer<(typeof stepSchemas)[N]> };
  const errors = flattenErrors(res.error);
  if (strict) return { ok: false as const, errors };
  const filled = Object.fromEntries(Object.entries(errors).filter(([k]) => (raw[k] ?? "").trim() !== ""));
  return Object.keys(filled).length ? { ok: false as const, errors: filled } : { ok: true as const, data: null };
}
