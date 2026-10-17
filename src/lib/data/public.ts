import "server-only";
import { connection } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/env";
import type { ApplicationStatus } from "@/lib/domain/status";
import type { FindingStatus } from "@/lib/domain/findings";

export type PublicProject = {
  public_ref: string;
  project_name: string;
  project_summary: string;
  token_name: string;
  ticker: string;
  chain: string;
  token_concept: string;
  insider_allocation_disclosure: string | null;
  status: ApplicationStatus;
  platform_bps: number | null;
  founder_bps: number | null;
  community_bps: number | null;
  launcher_bps: number | null;
  fees_disclosed_at: string | null;
  network: string | null;
  mint_address: string | null;
  launchlab_pool_address: string | null;
  cpmm_pool_address: string | null;
  mint_authority_revoked: boolean | null;
  freeze_authority_revoked: boolean | null;
  total_supply_raw: string | null;
  decimals: number | null;
  launch_tx: string | null;
  treasury_address: string | null;
  is_multisig: boolean | null;
  threshold: number | null;
  control_rules: string | null;
  pair_kind: "token" | "project" | "person" | null;
  pair_name: string | null;
  pair_url: string | null;
  pair_mint: string | null;
  pair_relationship: "inspired_by" | "official" | null;
  image_path: string | null;
  starter_buy_amount: number | string | null;
  starter_buy_tx: string | null;
  created_at: string;
  quote_mint: string;
  quote_symbol: string;
};

export type PublicFinding = {
  category: string;
  claim: string;
  status: FindingStatus;
  url: string | null;
  fetched_at: string | null;
};

export type DirectoryResult = { connected: false } | { connected: true; projects: PublicProject[] };

export async function listPublicProjects(): Promise<DirectoryResult> {
  await connection(); // always read at request time, never baked into the build
  if (!isSupabaseConfigured()) return { connected: false };
  const { data, error } = await createAnonClient()
    .from("public_projects")
    .select("*")
    .order("project_name");
  if (error) throw new Error(`Couldn't load projects: ${error.message}`);
  return { connected: true, projects: (data ?? []) as PublicProject[] };
}

export async function getPublicProject(ref: string) {
  await connection();
  if (!isSupabaseConfigured() || !/^STI-\d{4}-\d{6}$/.test(ref)) return null;
  const supabase = createAnonClient();
  const [{ data: project }, { data: findings }] = await Promise.all([
    supabase.from("public_projects").select("*").eq("public_ref", ref).maybeSingle(),
    supabase.from("public_verification").select("category, claim, status, url, fetched_at").eq("public_ref", ref),
  ]);
  if (!project) return null;
  return { project: project as PublicProject, findings: (findings ?? []) as PublicFinding[] };
}

export type PublicFeeClaim = { public_ref: string; source: "platform_fee" | "lp_fee_key" | "cpmm_creator_fee"; amount_raw: string; tx_signature: string; observed_at: string };
export type PublicPayout = { public_ref: string; recipient: "platform" | "founder" | "launcher" | "community"; recipient_address: string; amount_raw: string; status: string; tx_signature: string | null; updated_at: string };

export async function getPublicFees(ref?: string): Promise<{ connected: false } | { connected: true; claims: PublicFeeClaim[]; payouts: PublicPayout[] }> {
  await connection();
  if (!isSupabaseConfigured()) return { connected: false };
  const supabase = createAnonClient();
  let c = supabase.from("public_fee_claims").select("public_ref, source, amount_raw, tx_signature, observed_at").order("observed_at", { ascending: false }).limit(200);
  let p = supabase.from("public_payouts").select("public_ref, recipient, recipient_address, amount_raw, status, tx_signature, updated_at").order("updated_at", { ascending: false }).limit(400);
  if (ref) { c = c.eq("public_ref", ref); p = p.eq("public_ref", ref); }
  const [{ data: claims, error: e1 }, { data: payouts, error: e2 }] = await Promise.all([c, p]);
  if (e1 || e2) throw new Error(`Couldn't load fee records: ${(e1 ?? e2)!.message}`);
  return { connected: true, claims: (claims ?? []) as PublicFeeClaim[], payouts: (payouts ?? []) as PublicPayout[] };
}
