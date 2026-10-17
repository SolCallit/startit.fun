"use server";

import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { screenSoon } from "@/lib/screening/trigger";
import { EDITABLE, getApplicationBundle, stepDefaults, type LinkKind } from "./data";
import { EVIDENCE_MIME, MAX_EVIDENCE_BYTES, STEPS, parseStep, type FieldErrors, type StepNumber } from "./schema";

// `values` echoes what was submitted so React's automatic form reset doesn't wipe the user's input.
export type StepState = { errors?: FieldErrors; message?: string; values?: Record<string, string> };

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const raw = (fd: FormData) => {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
};
const orNull = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

export async function startApplication() {
  const user = await requireUser("/apply");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .insert({ applicant_id: user.id, contact_email: user.email || null })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't start an application: ${error.message}`);
  redirect(`/applications/${data.id}/edit?step=1`);
}

export async function saveStep(appId: string, step: StepNumber, _prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  if (!isUuid(appId) || !STEPS.some((s) => s.n === step)) return { errors: { _form: "Unknown application or step." } };

  const intent = formData.get("$intent") === "continue" ? "continue" : "draft";
  const values = raw(formData);
  const parsed = parseStep(step, values, intent === "continue");
  if (!parsed.ok) return { errors: parsed.errors, values };

  const supabase = await createClient();
  const { data: app } = await supabase.from("applications").select("id, status, draft_payload, applicant_id, applicant_is_founder").eq("id", appId).maybeSingle();
  if (!app || app.applicant_id !== user.id) return { errors: { _form: "Application not found." } };
  if (!EDITABLE.includes(app.status)) return { errors: { _form: "This application is locked while it's being reviewed." } };

  const fail = (e: { message: string } | null) => (e ? { errors: { _form: `Couldn't save: ${e.message}` }, values } : null);
  const update: Record<string, unknown> = { current_step: step };

  switch (step) {
    case 1: {
      const name = orNull(values.applicant_name);
      if (name) {
        const r = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
        if (fail(r.error)) return fail(r.error)!;
      }
      update.contact_email = orNull(values.contact_email);
      update.applicant_role = orNull(values.applicant_role);
      if (values.applicant_is_founder === "yes" || values.applicant_is_founder === "no") {
        const isFounder = values.applicant_is_founder === "yes";
        update.applicant_is_founder = isFounder;
        // When who's launching changes, reset to that case's default split (DB enforces no launcher share on self-launch).
        if (app.applicant_is_founder !== isFounder) Object.assign(update, isFounder
          ? { proposed_platform_bps: 2000, proposed_founder_bps: 3000, proposed_launcher_bps: 0, proposed_community_bps: 5000 }
          : { proposed_platform_bps: 1500, proposed_founder_bps: 3000, proposed_launcher_bps: 500, proposed_community_bps: 5000 });
      }
      break;
    }
    case 2: {
      update.project_name = orNull(values.project_name);
      update.project_summary = orNull(values.project_summary);
      const kinds: [string, LinkKind][] = [["website", "website"], ["x", "x"], ["github", "github"], ["docs", "docs"], ["demo", "demo"], ["other_social", "other"]];
      const seen = new Set<string>();
      const rows = kinds
        .map(([field, kind]) => ({ application_id: appId, kind, url: orNull(values[field]) }))
        .filter((r): r is { application_id: string; kind: LinkKind; url: string } => {
          if (!r.url || seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        });
      const del = await supabase.from("application_links").delete().eq("application_id", appId).in("kind", kinds.map(([, k]) => k));
      if (fail(del.error)) return fail(del.error)!;
      if (rows.length) {
        const ins = await supabase.from("application_links").insert(rows);
        if (fail(ins.error)) return fail(ins.error)!;
      }
      break;
    }
    case 3:
      update.founder_approval_statement = orNull(values.founder_approval_statement);
      update.permitted_branding = orNull(values.permitted_branding);
      break;
    case 4: {
      update.token_name = orNull(values.token_name);
      update.ticker = orNull(values.ticker)?.toUpperCase() ?? null;
      update.token_concept = orNull(values.token_concept);
      update.community_plan = orNull(values.community_plan);
      update.quote_mint = orNull(values.quote_mint);
      // Inspired-by link: all-or-nothing on the kind; clearing the kind clears the rest.
      const kind = orNull(values.pair_kind);
      update.pair_kind = kind;
      update.pair_name = kind ? orNull(values.pair_name) : null;
      update.pair_relationship = kind ? orNull(values.pair_relationship) : null;
      update.pair_reason = kind ? orNull(values.pair_reason) : null;
      update.pair_url = kind ? orNull(values.pair_url) : null;
      update.pair_mint = kind === "token" ? orNull(values.pair_mint) : null;
      const titles = (values.milestones ?? "").split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 20);
      const del = await supabase.from("milestone_plans").delete().eq("application_id", appId);
      if (fail(del.error)) return fail(del.error)!;
      if (titles.length) {
        const ins = await supabase.from("milestone_plans").insert(titles.map((title) => ({ application_id: appId, title: title.slice(0, 200) })));
        if (fail(ins.error)) return fail(ins.error)!;
      }
      break;
    }
    case 5: {
      const p = Number(values.proposed_platform_bps), f = Number(values.proposed_founder_bps);
      const l = Number(values.proposed_launcher_bps), c = Number(values.proposed_community_bps);
      if ([p, f, l, c].every(Number.isInteger) && p + f + l + c === 10000) {
        Object.assign(update, { proposed_platform_bps: p, proposed_founder_bps: f, proposed_launcher_bps: l, proposed_community_bps: c });
      }
      update.draft_payload = { ...(app.draft_payload ?? {}), split_reason: orNull(values.split_reason) };
      break;
    }
    case 6: {
      update.insider_allocation_disclosure = orNull(values.insider_allocation_disclosure);
      const allAck = ["ack_no_returns", "ack_not_ownership", "ack_disclosure", "ack_accurate"].every((k) => values[k] === "on");
      update.disclosures_acknowledged_at = allAck ? new Date().toISOString() : null;
      break;
    }
  }

  const { error } = await supabase.from("applications").update(update).eq("id", appId);
  if (error) {
    if (error.code === "23505") return { errors: { ticker: "Another active application already uses this ticker." }, values };
    if (error.code === "23503" && /quote_mint/.test(error.message)) return { errors: { quote_mint: "That pair isn't available. Pick one from the list." }, values };
    return { errors: { _form: `Couldn't save: ${error.message}` }, values };
  }

  revalidatePath(`/applications/${appId}`);
  if (intent === "continue") {
    if (step < 6) redirect(`/applications/${appId}/edit?step=${step + 1}`);
    return { ...(await submitAfterFinalStep(appId)), values };
  }
  return { message: "Draft saved.", values };
}

/** Final step: re-validate every step from what's saved, then submit through the database. */
async function submitAfterFinalStep(appId: string): Promise<StepState> {
  const bundle = await getApplicationBundle(appId);
  if (!bundle) return { errors: { _form: "Application not found." } };

  for (const s of STEPS.slice(0, 5)) {
    const r = parseStep(s.n, stepDefaults(bundle, s.n), true);
    if (!r.ok) {
      const [field, msg] = Object.entries(r.errors)[0]!;
      return { errors: { _form: `Step ${s.n} (${s.title}) is incomplete — ${msg}`, [`step_${s.n}`]: field } };
    }
  }
  if (!bundle.evidence.some((e) => e.kind === "authorization")) {
    return { errors: { _form: "Step 3 is incomplete — upload proof that you're authorized to represent the company." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_application", { p_app: appId });
  if (error) return { errors: { _form: `Couldn't submit: ${error.message}` } };
  screenSoon();
  redirect(`/applications/${appId}?submitted=1`);
}

export type UploadState = { error?: string; message?: string };

export async function uploadEvidence(appId: string, _prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();
  if (!isUuid(appId)) return { error: "Unknown application." };
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (kind !== "authorization" && kind !== "founder_approval" && kind !== "identity" && kind !== "other") return { error: "Choose what this file proves." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_EVIDENCE_BYTES) return { error: "Files must be 4 MB or smaller. Link larger documents in your description instead." };
  if (!(EVIDENCE_MIME as readonly string[]).includes(file.type)) return { error: "Upload a PDF, PNG, JPEG, WebP or plain-text file." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/plain": "txt" }[file.type];
  // Path is server-generated; the user's filename never touches storage keys.
  const path = `${user.id}/${appId}/${randomUUID()}.${ext}`;

  const supabase = await createClient();
  const up = await supabase.storage.from("evidence").upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) return { error: `Upload failed: ${up.error.message}` };

  const ins = await supabase.from("evidence_files").insert({
    application_id: appId, kind, storage_path: path, sha256, mime_type: file.type, byte_size: file.size, uploaded_by: user.id,
  });
  if (ins.error) {
    await supabase.storage.from("evidence").remove([path]);
    return { error: `Couldn't record the file: ${ins.error.message}` };
  }
  revalidatePath(`/applications/${appId}/edit`);
  return { message: "File uploaded." };
}

export async function respondToEvidenceRequest(appId: string, requestId: string, formData: FormData) {
  await requireUser();
  const response = String(formData.get("response") ?? "").trim();
  if (!isUuid(appId) || !isUuid(requestId) || !response) return;
  const supabase = await createClient();
  await supabase.from("evidence_requests").update({ response: response.slice(0, 4000), responded_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath(`/applications/${appId}`);
}

export async function resubmitApplication(appId: string) {
  await requireUser();
  if (!isUuid(appId)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_application", { p_app: appId });
  if (error) throw new Error(error.message);
  screenSoon();
  revalidatePath(`/applications/${appId}`);
  redirect(`/applications/${appId}?submitted=1`);
}
