import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/domain/status";
import type { FindingStatus } from "@/lib/domain/findings";

export async function getDashboardCounts() {
  const supabase = await createClient();
  const count = async (statuses?: ApplicationStatus[]) => {
    let q = supabase.from("applications").select("id", { count: "exact", head: true });
    if (statuses) q = q.in("status", statuses);
    const { count: n, error } = await q;
    if (error) throw new Error(error.message);
    return n ?? 0;
  };

  const [total, awaiting, approved, pendingLaunch, live, suspended, flaggedRuns, pendingPayouts, failedPayouts, claims, paid] =
    await Promise.all([
      count(["submitted", "ai_screening", "evidence_requested", "awaiting_review", "approved", "launch_config_pending", "ready_for_deployment", "launched", "rejected", "suspended"]),
      count(["awaiting_review"]),
      count(["approved"]),
      count(["launch_config_pending", "ready_for_deployment"]),
      count(["launched"]),
      count(["suspended"]),
      supabase.from("review_queue").select("id", { count: "exact", head: true })
        .eq("status", "awaiting_review").or("flagged_count.gt.0,recommendation.eq.recommend_rejection"),
      supabase.from("payouts").select("id", { count: "exact", head: true }).in("status", ["pending", "submitted"]),
      supabase.from("payouts").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("fee_claims").select("amount_raw"),
      supabase.from("payouts").select("amount_raw, recipient").eq("status", "confirmed"),
    ]);

  const sum = (rows: { amount_raw: string | number }[] | null) => (rows ?? []).reduce((a, r) => a + BigInt(r.amount_raw), BigInt(0));
  const paidRows = (paid.data ?? []) as { amount_raw: string; recipient: string }[];

  return {
    total, awaiting, approved, pendingLaunch, live, suspended,
    flaggedFindings: flaggedRuns.count ?? 0,
    pendingPayouts: pendingPayouts.count ?? 0,
    failedPayouts: failedPayouts.count ?? 0,
    feesCollectedRaw: sum(claims.data as { amount_raw: string }[]),
    feesDistributedRaw: sum(paidRows),
    platformFeesRaw: sum(paidRows.filter((r) => r.recipient === "platform")),
  };
}

export type QueueRow = {
  id: string; public_ref: string; project_name: string | null; ticker: string | null; status: ApplicationStatus;
  submitted_at: string | null; updated_at: string; latest_run_status: string | null; recommendation: string | null;
  confidence: number | null; flagged_count: number; needs_review_count: number;
};

export async function getQueue(statuses: ApplicationStatus[]) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("review_queue")
    .select("*")
    .in("status", statuses)
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as QueueRow[];
}

export type ScreeningView = {
  run: { id: string; status: string; provider: string; model: string; prompt_version: string; error: string | null; started_at: string | null; finished_at: string | null };
  report: { recommendation: string; confidence: number; summary: string; limitations: string; next_steps: string[] } | null;
  findings: { id: string; category: string; claim: string; status: FindingStatus; detail: string; severity: number;
    finding_sources: { url: string; fetched_at: string; http_status: number | null; content_sha256: string | null }[] }[];
};

export async function getScreening(appId: string): Promise<{ latest: ScreeningView | null; runCount: number }> {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("screening_runs")
    .select("id, status, provider, model, prompt_version, error, started_at, finished_at")
    .eq("application_id", appId)
    .order("queued_at", { ascending: false });
  if (!runs?.length) return { latest: null, runCount: 0 };
  const run = runs[0]!;
  const [{ data: report }, { data: findings }] = await Promise.all([
    supabase.from("screening_reports").select("recommendation, confidence, summary, limitations, next_steps").eq("run_id", run.id).maybeSingle(),
    supabase.from("screening_findings").select("id, category, claim, status, detail, severity, finding_sources(url, fetched_at, http_status, content_sha256)")
      .eq("run_id", run.id).order("severity", { ascending: false }),
  ]);
  return { latest: { run, report: report as ScreeningView["report"], findings: (findings ?? []) as ScreeningView["findings"] }, runCount: runs.length };
}

export async function getNotes(appId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("operator_notes")
    .select("id, body, created_at, profiles(display_name)")
    .eq("application_id", appId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as { id: string; body: string; created_at: string; profiles: { display_name: string } | null }[];
}

/** Short-lived signed links so reviewers can open private evidence. */
export async function signEvidence(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("evidence").createSignedUrls(paths, 300);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
}

export async function getTransitionsWithActors(appId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("status_transitions")
    .select("id, from_status, to_status, actor_role, reason, created_at, profiles(display_name)")
    .eq("application_id", appId)
    .order("id", { ascending: false });
  return (data ?? []) as unknown as {
    id: number; from_status: ApplicationStatus; to_status: ApplicationStatus; actor_role: string; reason: string | null; created_at: string;
    profiles: { display_name: string } | null;
  }[];
}
