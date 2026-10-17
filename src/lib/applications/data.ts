import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/domain/status";

export type LinkKind = "website" | "x" | "github" | "docs" | "demo" | "discord" | "telegram" | "other";

export type ApplicationRow = {
  id: string;
  public_ref: string;
  applicant_id: string;
  status: ApplicationStatus;
  current_step: number;
  project_name: string | null;
  image_path: string | null;
  starter_buy_amount: number | string;
  quote_mint: string | null;
  pair_kind: "token" | "project" | "person" | null;
  pair_name: string | null;
  pair_relationship: "inspired_by" | "official" | null;
  pair_reason: string | null;
  pair_url: string | null;
  pair_mint: string | null;
  project_summary: string | null;
  applicant_role: string | null;
  contact_email: string | null;
  token_name: string | null;
  ticker: string | null;
  chain: string;
  token_concept: string | null;
  community_plan: string | null;
  proposed_platform_bps: number;
  proposed_founder_bps: number;
  proposed_launcher_bps: number;
  proposed_community_bps: number;
  applicant_is_founder: boolean | null;
  founder_approval_statement: string | null;
  permitted_branding: string | null;
  insider_allocation_disclosure: string | null;
  disclosures_acknowledged_at: string | null;
  draft_payload: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationBundle = {
  app: ApplicationRow;
  links: { id: string; kind: LinkKind; url: string }[];
  evidence: { id: string; kind: string; storage_path: string; mime_type: string; byte_size: number; sha256: string; uploaded_at: string }[];
  milestones: { id: string; title: string }[];
  transitions: { id: number; from_status: ApplicationStatus; to_status: ApplicationStatus; actor_role: string; reason: string | null; created_at: string }[];
  evidenceRequests: { id: string; message: string; response: string | null; responded_at: string | null; created_at: string }[];
  applicantName: string | null;
};

export const EDITABLE: ApplicationStatus[] = ["draft", "evidence_requested"];

export async function listMyApplications(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("id, public_ref, status, project_name, ticker, updated_at, submitted_at, applicant_is_founder")
    .eq("applicant_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Pick<ApplicationRow, "id" | "public_ref" | "status" | "project_name" | "ticker" | "updated_at" | "submitted_at" | "applicant_is_founder">[];
}

/** Loads an application with everything the applicant (or staff) may see. RLS decides access. */
export async function getApplicationBundle(id: string): Promise<ApplicationBundle | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: app } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!app) return null;

  const [links, evidence, milestones, transitions, requests, profile] = await Promise.all([
    supabase.from("application_links").select("id, kind, url").eq("application_id", id).order("created_at"),
    supabase.from("evidence_files").select("id, kind, storage_path, mime_type, byte_size, sha256, uploaded_at").eq("application_id", id).order("uploaded_at"),
    supabase.from("milestone_plans").select("id, title").eq("application_id", id),
    supabase.from("status_transitions").select("id, from_status, to_status, actor_role, reason, created_at").eq("application_id", id).order("id"),
    supabase.from("evidence_requests").select("id, message, response, responded_at, created_at").eq("application_id", id).order("created_at"),
    supabase.from("profiles").select("display_name").eq("id", app.applicant_id).maybeSingle(),
  ]);

  return {
    app: app as ApplicationRow,
    links: (links.data ?? []) as ApplicationBundle["links"],
    evidence: (evidence.data ?? []) as ApplicationBundle["evidence"],
    milestones: (milestones.data ?? []) as ApplicationBundle["milestones"],
    transitions: (transitions.data ?? []) as ApplicationBundle["transitions"],
    evidenceRequests: (requests.data ?? []) as ApplicationBundle["evidenceRequests"],
    applicantName: profile.data?.display_name ?? null,
  };
}

/** Current saved values for one form step, as strings for the inputs. */
export function stepDefaults(b: ApplicationBundle, step: number): Record<string, string> {
  const a = b.app;
  const link = (k: LinkKind) => b.links.find((l) => l.kind === k)?.url ?? "";
  const s = (v: string | null | undefined) => v ?? "";
  switch (step) {
    case 1:
      return {
        project_name: s(a.project_name), ticker: s(a.ticker), project_summary: s(a.project_summary),
        website: link("website"), x: link("x"), github: link("github"), telegram: link("telegram"), discord: link("discord"),
        quote_mint: s(a.quote_mint),
        pair_kind: s(a.pair_kind), pair_name: s(a.pair_name), pair_relationship: s(a.pair_relationship),
        pair_reason: s(a.pair_reason), pair_url: s(a.pair_url), pair_mint: s(a.pair_mint),
      };
    case 2:
      return {
        applicant_is_founder: a.applicant_is_founder ? "yes" : "no",
        proposed_platform_bps: String(a.proposed_platform_bps),
        proposed_founder_bps: String(a.proposed_founder_bps),
        proposed_launcher_bps: String(a.proposed_launcher_bps),
        proposed_community_bps: String(a.proposed_community_bps),
        split_reason: typeof a.draft_payload?.split_reason === "string" ? a.draft_payload.split_reason : "",
      };
    case 3:
      return {
        starter_buy_amount: Number(a.starter_buy_amount) > 0 ? String(Number(a.starter_buy_amount)) : "",
        ack_terms: a.disclosures_acknowledged_at ? "on" : "",
      };
    default:
      return {};
  }
}

/** Tokens a launch can be paired with on-chain (enabled quote tokens). SOL first. */
export async function listQuoteOptions(): Promise<{ mint: string; symbol: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("quote_tokens").select("mint, symbol, name").eq("enabled", true).order("created_at");
  return data ?? [];
}
