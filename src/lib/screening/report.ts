import { z } from "zod";
import { FINDING_STATUSES } from "@/lib/domain/findings";

export const PROMPT_VERSION = "screen-v1";

export type Source = { url: string; fetched_at: string; content_sha256?: string | null; http_status?: number | null };

export type Finding = {
  category: "identity" | "website" | "repository" | "socials" | "token_disclosure" | "consistency" | "impersonation" | "other";
  claim: string;
  status: (typeof FINDING_STATUSES)[number];
  detail: string;
  severity: 1 | 2 | 3 | 4 | 5;
  sources: Source[];
};

export const RECOMMENDATIONS = ["proceed_to_human_review", "request_evidence", "recommend_rejection"] as const;

/** What the model must return. Sources are referenced by id ("S1"), never by free-form URL. */
export const modelOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  recommendation: z.enum(RECOMMENDATIONS),
  confidence: z.number().min(0).max(1),
  limitations: z.string().min(1).max(2000),
  next_steps: z.array(z.string().max(300)).max(8),
  findings: z
    .array(
      z.object({
        category: z.enum(["identity", "website", "repository", "socials", "token_disclosure", "consistency", "impersonation", "other"]),
        claim: z.string().min(1).max(300),
        status: z.enum(FINDING_STATUSES),
        detail: z.string().min(1).max(1200),
        severity: z.number().int().min(1).max(5),
        source_ids: z.array(z.string().regex(/^S\d{1,3}$/)).max(6),
      }),
    )
    .max(25),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

export type FinalReport = {
  recommendation: (typeof RECOMMENDATIONS)[number];
  confidence: number;
  summary: string;
  limitations: string;
  next_steps: string[];
  findings: Finding[];
};

/** Language we never allow in a report, whatever the model writes. */
const BANNED = /\b(rug[- ]?proof|guaranteed?\s+(safe|legit(imate)?|returns?)|risk[- ]free|100%\s+safe)\b/gi;
export const scrub = (s: string) => s.replace(BANNED, "[removed: unsupported assurance]");

/**
 * Merges deterministic findings with the model's, resolving source ids against what we actually fetched.
 * A model finding marked VERIFIED with no real source is downgraded to UNVERIFIED.
 */
export function mergeReport(deterministic: Finding[], model: ModelOutput, sources: Map<string, Source>, baseLimitations: string[]): FinalReport {
  const modelFindings: Finding[] = model.findings.map((f) => {
    const resolved = f.source_ids.map((id) => sources.get(id)).filter((s): s is Source => !!s);
    const status = f.status === "VERIFIED" && resolved.length === 0 ? "UNVERIFIED" : f.status;
    const detail = status !== f.status ? `${f.detail} (Downgraded: no fetched source supports this.)` : f.detail;
    return { category: f.category, claim: scrub(f.claim), status, detail: scrub(detail), severity: f.severity as Finding["severity"], sources: resolved };
  });

  const anyFlagged = [...deterministic, ...modelFindings].some((f) => f.status === "FLAGGED");
  return {
    recommendation: model.recommendation,
    // A report with flagged findings can't claim high confidence in a clean result.
    confidence: anyFlagged && model.recommendation === "proceed_to_human_review" ? Math.min(model.confidence, 0.5) : model.confidence,
    summary: scrub(model.summary),
    limitations: [...baseLimitations, scrub(model.limitations)].join(" "),
    next_steps: model.next_steps.map(scrub),
    findings: [...deterministic, ...modelFindings],
  };
}
