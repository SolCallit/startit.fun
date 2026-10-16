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
