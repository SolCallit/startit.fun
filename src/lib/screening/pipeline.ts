import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { screeningEnv, supabasePublicEnv } from "@/lib/env";
import { getProvider, type ScreeningProvider } from "./providers";
import { ProviderError } from "./providers/types";
import { htmlToText, safeFetch } from "./safe-fetch";
import { fetchGitHubEvidence } from "./fetchers/github";
import { runChecks, type WebsiteEvidence } from "./checks";
import { mergeReport, modelOutputSchema, PROMPT_VERSION, type FinalReport, type Source } from "./report";
import { buildUserPrompt, extractJson, SYSTEM_PROMPT, type PromptSource } from "./prompt";

type Log = (msg: string, extra?: Record<string, unknown>) => void;
const defaultLog: Log = (msg, extra) => console.log(JSON.stringify({ at: new Date().toISOString(), svc: "screening", msg, ...extra }));

/** Signs in as the dedicated screening account. It holds only the screening_service role. */
export async function serviceClient(): Promise<SupabaseClient> {
  const env = { ...supabasePublicEnv(), ...screeningEnv() };
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: env.SCREENING_SERVICE_EMAIL, password: env.SCREENING_SERVICE_PASSWORD });
  if (error) throw new Error(`Screening service sign-in failed: ${error.message}`);
  return supabase;
}

async function fetchWebsite(url: string): Promise<{ evidence: WebsiteEvidence; body: string }> {
  try {
    const r = await safeFetch(url);
    const parsed = r.contentType.includes("html") ? htmlToText(r.text) : { title: "", text: r.text.slice(0, 12_000), links: [] };
    return {
      evidence: { ok: true, requestedUrl: url, url: r.url, status: r.status, fetchedAt: r.fetchedAt, sha256: r.sha256, title: parsed.title, text: parsed.text, links: parsed.links },
      body: `Title: ${parsed.title}\nLinks: ${parsed.links.slice(0, 40).join(" ")}\n\n${parsed.text}`,
    };
  } catch (e) {
    return { evidence: { ok: false, requestedUrl: url, fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }, body: "" };
  }
}

/** Collects evidence, runs deterministic checks, asks the model, and returns a merged report. No DB writes. */
export async function screen(supabase: SupabaseClient, appId: string, provider: ScreeningProvider, log: Log = defaultLog): Promise<FinalReport> {
  const [{ data: app, error }, { data: links }, { data: milestones }] = await Promise.all([
    supabase.from("applications").select("*").eq("id", appId).single(),
    supabase.from("application_links").select("kind, url").eq("application_id", appId),
    supabase.from("milestone_plans").select("title").eq("application_id", appId),
  ]);
  if (error || !app) throw new Error(`Can't load application ${appId}: ${error?.message}`);
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", app.applicant_id).maybeSingle();

  const link = (k: string) => (links ?? []).find((l) => l.kind === k)?.url ?? null;
  const websiteUrl = link("website"), xUrl = link("x"), githubUrl = link("github");

  const [site, docs, demo, github] = await Promise.all([
    websiteUrl ? fetchWebsite(websiteUrl) : Promise.resolve(null),
    link("docs") ? fetchWebsite(link("docs")!) : Promise.resolve(null),
    link("demo") ? fetchWebsite(link("demo")!) : Promise.resolve(null),
    githubUrl ? fetchGitHubEvidence(githubUrl, screeningEnv().GITHUB_TOKEN) : Promise.resolve(null),
  ]);
  log("evidence collected", { appId, site: site?.evidence.ok, github: github?.kind });

  const { findings: deterministic, limitations } = runChecks({
    websiteUrl, xUrl, githubUrl, contactEmail: app.contact_email, website: site?.evidence ?? null, github,
  });

  // Number the sources the model may cite.
  const promptSources: PromptSource[] = [];
  const addSource = (label: string, source: Source, body: string) => {
    if (!body) return;
    promptSources.push({ id: `S${promptSources.length + 1}`, label, source, body: body.slice(0, 12_000) });
  };
  for (const [label, s] of [["website", site], ["docs", docs], ["demo", demo]] as const) {
    if (s?.evidence.ok) addSource(label, { url: s.evidence.url, fetched_at: s.evidence.fetchedAt, content_sha256: s.evidence.sha256, http_status: s.evidence.status }, s.body);
  }
  if (github && github.kind !== "missing") {
    const src = { url: github.apiUrl, fetched_at: github.fetchedAt, content_sha256: github.sha256, http_status: 200 };
    if (github.kind === "repo") {
      addSource("github repository metadata", src, JSON.stringify({ ...github.repo, recentCommits: github.recentCommits.slice(0, 15), releases: github.releases, contributors: github.contributors }));
      addSource("github README", { ...src, url: `${github.url.replace(/\/$/, "")}#readme` }, github.readme);
    } else {
      addSource("github account", src, JSON.stringify({ ...github.org, topRepos: github.topRepos }));
    }
  }

  const application = {
    applicant_name: profile?.display_name, applicant_role: app.applicant_role, contact_email_domain: app.contact_email?.split("@")[1],
    project_name: app.project_name, project_summary: app.project_summary, links,
    token_name: app.token_name, ticker: app.ticker, chain: app.chain, token_concept: app.token_concept,
    community_plan: app.community_plan, milestones: (milestones ?? []).map((m) => m.title),
    founder_approval_statement: app.founder_approval_statement, permitted_branding: app.permitted_branding,
    insider_allocation_disclosure: app.insider_allocation_disclosure,
    applicant_is_founder: app.applicant_is_founder,
    proposed_fee_split_bps: { platform: app.proposed_platform_bps, founder: app.proposed_founder_bps, launcher: app.proposed_launcher_bps, community: app.proposed_community_bps },
  };

  const user = buildUserPrompt(application, deterministic, promptSources);
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await provider.complete({
      system: SYSTEM_PROMPT,
      user: attempt === 1 ? user : `${user}\n\nYour previous reply was invalid (${lastErr}). Reply with only the JSON object in the required shape.`,
      maxTokens: 4_000,
    });
    try {
      const parsed = modelOutputSchema.parse(extractJson(text));
      const sourceMap = new Map(promptSources.map((s) => [s.id, s.source]));
      return mergeReport(deterministic, parsed, sourceMap, limitations);
    } catch (e) {
      lastErr = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      log("model output invalid", { appId, attempt, error: lastErr });
    }
  }
  throw new Error(`Model output failed validation twice: ${lastErr}`);
}

/** Claims at most `max` applications, screens each, records the result. Returns how many were processed. */
export async function runScreeningBatch(max = 1, log: Log = defaultLog): Promise<{ processed: number; failed: number }> {
  const provider = getProvider();
  const supabase = await serviceClient();
  let processed = 0, failed = 0;

  for (let i = 0; i < max; i++) {
    const { data: claimed, error } = await supabase.rpc("claim_next_screening", {
      p_provider: provider.name, p_model: provider.model, p_prompt_version: PROMPT_VERSION,
    });
    if (error) throw new Error(`claim_next_screening failed: ${error.message}`);
    const job = (claimed as { run_id: string; application_id: string }[] | null)?.[0];
    if (!job) break;

    log("screening started", { run: job.run_id, appId: job.application_id, provider: provider.name, model: provider.model });
    try {
      const report = await screen(supabase, job.application_id, provider, log);
      const { error: cErr } = await supabase.rpc("complete_screening", { p_run: job.run_id, p_report: report });
      if (cErr) throw new Error(`complete_screening failed: ${cErr.message}`);
      processed++;
      log("screening completed", { run: job.run_id, recommendation: report.recommendation, findings: report.findings.length });
    } catch (e) {
      failed++;
      const msg = e instanceof ProviderError ? `Provider error: ${e.message}` : e instanceof Error ? e.message : String(e);
      log("screening failed", { run: job.run_id, error: msg });
      await supabase.rpc("fail_screening", { p_run: job.run_id, p_error: msg });
    }
  }
  await supabase.auth.signOut();
  return { processed, failed };
}
