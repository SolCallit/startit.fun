import { z } from "zod";
import { isDefaultSplit, validateSplit } from "@/lib/domain/fees";

/** Six screens covering the 12 required sections of the application. */
export const STEPS = [
  { n: 1, title: "About you", covers: "Applicant name and verified contact" },
  { n: 2, title: "Project and links", covers: "Project, website, X and socials, GitHub, docs and demo" },
  { n: 3, title: "Founder authorization", covers: "Proof you represent the company, written founder approval and branding" },
  { n: 4, title: "Token and community", covers: "Token name, ticker, chain, concept, milestones and community plan" },
  { n: 5, title: "Fee split", covers: "Platform, founder and community allocation" },
  { n: 6, title: "Disclosures and submit", covers: "Insider allocations, required acknowledgements" },
] as const;
export type StepNumber = (typeof STEPS)[number]["n"];

export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
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
export const PAIR_KINDS = { token: "A Solana token", project: "A project or company", person: "A person" } as const;
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

export const stepSchemas = {
  1: z.object({
    applicant_name: required("Your name", 120),
    contact_email: z.email("Enter a valid email address."),
    applicant_role: required("Your role", 200),
    applicant_is_founder: z.enum(["yes", "no"], { error: "Tell us whether you're the founder." }),
  }),
  2: z.object({
    project_name: required("Project name", 120),
    project_summary: required("Project description", 4000),
    website: httpsUrl("Website"),
    x: httpsUrl("X account", ["x.com", "twitter.com"]),
    github: httpsUrl("GitHub link", ["github.com"]),
    docs: optionalUrl("Docs link"),
    demo: optionalUrl("Demo link"),
    other_social: optionalUrl("Other social link"),
  }),
  3: z.object({
    founder_approval_statement: required("Written founder approval", 4000).min(40, "Write at least a sentence or two of approval from the founder."),
    permitted_branding: required("Permitted branding", 2000),
  }),
  4: z
    .object({
      token_name: required("Token name", 32),
      ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "Ticker must be 2–10 letters or numbers."),
      token_concept: required("Token concept", 4000),
      community_plan: required("Community plan", 4000),
      milestones: trimmed(4000),
      ...pairFields,
    })
    .superRefine(checkPair),
  5: z
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
        ctx.addIssue({ code: "custom", message: "You're launching your own project, so there's no separate launcher share.", path: ["proposed_launcher_bps"] });
      }
      if (!isDefaultSplit(split) && !v.split_reason) ctx.addIssue({ code: "custom", message: "Explain why you're proposing a different split.", path: ["split_reason"] });
    }),
  6: z.object({
    insider_allocation_disclosure: required("Insider allocation disclosure", 4000),
    ack_no_returns: z.literal("on", { error: "Confirm you won't promise price appreciation." }),
    ack_not_ownership: z.literal("on", { error: "Confirm you understand founder approval doesn't grant token ownership." }),
    ack_disclosure: z.literal("on", { error: "Confirm the disclosures will be published." }),
    ack_accurate: z.literal("on", { error: "Confirm the application is accurate." }),
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
