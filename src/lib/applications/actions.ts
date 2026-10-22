"use server";

import { DB_NETWORK } from "@/lib/network";
import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { screenSoon } from "@/lib/screening/trigger";
import { EDITABLE, getApplicationBundle, stepDefaults, type LinkKind } from "./data";
import { EVIDENCE_MIME, IMAGE_MIME, MAX_EVIDENCE_BYTES, MAX_IMAGE_BYTES, STEPS, parseStep, type FieldErrors, type StepNumber } from "./schema";

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
  const { data: app } = await supabase.from("applications").select("id, status, draft_payload, applicant_id, applicant_is_founder, quote_mint").eq("id", appId).maybeSingle();
  if (!app || app.applicant_id !== user.id) return { errors: { _form: "Application not found." } };
  if (!EDITABLE.includes(app.status)) return { errors: { _form: "This application is locked while it's being reviewed." } };

  const fail = (e: { message: string } | null) => (e ? { errors: { _form: `Couldn't save: ${e.message}` }, values } : null);
  const update: Record<string, unknown> = { current_step: step };

  switch (step) {
    case 1: {
      const name = orNull(values.project_name);
      const summary = orNull(values.project_summary);
      // The coin can carry a meme name ($PREDAINU); it defaults to the product's name. The description is shared.
      Object.assign(update, { project_name: name, token_name: orNull(values.token_name) ?? name, project_summary: summary, token_concept: summary });
      update.ticker = orNull(values.ticker)?.toUpperCase() ?? null;
      update.quote_mint = orNull(values.quote_mint);
      if (update.quote_mint) {
        const { data: q } = await supabase.from("quote_tokens").select("network").eq("mint", update.quote_mint as string).maybeSingle();
        if (q && q.network !== DB_NETWORK) return { errors: { quote_mint: "That pair unlocks when Startit moves to mainnet. Pick one without the Mainnet tag." }, values };
      }
      const kind = orNull(values.pair_kind);
      update.pair_kind = kind;
      update.pair_name = kind ? orNull(values.pair_name) : null;
      update.pair_relationship = kind ? orNull(values.pair_relationship) : null;
      update.pair_reason = kind ? orNull(values.pair_reason) : null;
      update.pair_url = kind ? orNull(values.pair_url) : null;
      update.pair_mint = kind === "token" ? orNull(values.pair_mint) : null;

      const kinds: [string, LinkKind][] = [["website", "website"], ["x", "x"], ["github", "github"], ["telegram", "telegram"], ["discord", "discord"]];
      const seen = new Set<string>();
      const rows = kinds
        .map(([field, k]) => ({ application_id: appId, kind: k, url: orNull(values[field]) }))
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
    case 2: {
      const isFounder = values.applicant_is_founder === "yes";
      update.applicant_is_founder = isFounder;
      update.applicant_role = isFounder ? "On the team" : "Backer";
      const p = Number(values.proposed_platform_bps), f = Number(values.proposed_founder_bps);
      const l = Number(values.proposed_launcher_bps), c = Number(values.proposed_community_bps);
      if ([p, f, l, c].every(Number.isInteger) && p + f + l + c === 10000 && !(isFounder && l !== 0)) {
        Object.assign(update, { proposed_platform_bps: p, proposed_founder_bps: f, proposed_launcher_bps: l, proposed_community_bps: c });
      } else if (isFounder) {
        // The database refuses a starter share on a self-launch; fall back to the self-launch default.
        Object.assign(update, { proposed_platform_bps: 2000, proposed_founder_bps: 3000, proposed_launcher_bps: 0, proposed_community_bps: 5000 });
      }
      update.draft_payload = { ...(app.draft_payload ?? {}), split_reason: orNull(values.split_reason) };
      break;
    }
    case 3: {
      const amount = Number(values.starter_buy_amount || 0);
      if (Number.isFinite(amount) && amount >= 0) update.starter_buy_amount = amount;
      const { data: q } = await supabase.from("quote_tokens").select("symbol").eq("mint", app.quote_mint ?? "So11111111111111111111111111111111111111112").maybeSingle();
      update.insider_allocation_disclosure = amount > 0
        ? `Starter's buy: the starter plans to spend ${amount} ${q?.symbol ?? "SOL"} on the coin right after launch, from their own wallet. No other team, starter or Startit allocation.`
        : "None. No brand, team, starter or Startit allocation, and no starter's buy.";
      update.disclosures_acknowledged_at = values.ack_terms === "on" ? new Date().toISOString() : null;
      break;
    }
  }

  const { error } = await supabase.from("applications").update(update).eq("id", appId);
  if (error) {
    if (error.code === "23505") {
      return /ticker/.test(error.message)
        ? { errors: { ticker: "Another live coin already uses this ticker." }, values }
        : { errors: { project_name: "You already have an application for this project." }, values };
    }
    if (error.code === "23503" && /quote_mint/.test(error.message)) return { errors: { quote_mint: "That pair isn't available. Pick one from the list." }, values };
    return { errors: { _form: `Couldn't save: ${error.message}` }, values };
  }

  revalidatePath(`/applications/${appId}`);
  if (intent === "continue") {
    if (step === 1) {
      const bundle = await getApplicationBundle(appId);
      const missing: FieldErrors = {};
      if (!bundle?.app.image_path) missing.image = "Add an image for the coin.";
      if (!bundle?.evidence.some((e) => e.kind === "authorization" || e.kind === "founder_approval")) missing.proof = "Upload proof the brand is in.";
      if (Object.keys(missing).length) return { errors: missing, values };
    }
    if (step < STEPS.length) redirect(`/applications/${appId}/edit?step=${step + 1}`);
    return { ...(await submitAfterFinalStep(appId)), values };
  }
  return { message: "Draft saved.", values };
}

/** Final step: re-validate every step from what's saved, then submit through the database. */
async function submitAfterFinalStep(appId: string): Promise<StepState> {
  const bundle = await getApplicationBundle(appId);
  if (!bundle) return { errors: { _form: "Application not found." } };

  for (const s of STEPS.slice(0, -1)) {
    const r = parseStep(s.n, stepDefaults(bundle, s.n), true);
    if (!r.ok) {
      const [, msg] = Object.entries(r.errors)[0]!;
      return { errors: { _form: `${s.title}: ${msg}` } };
    }
  }
  if (!bundle.app.image_path) return { errors: { _form: "Your coin: add an image." } };
  if (!bundle.evidence.some((e) => e.kind === "authorization" || e.kind === "founder_approval")) {
    return { errors: { _form: "Your coin: upload proof the brand is in." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_application", { p_app: appId });
  if (error) return { errors: { _form: `Couldn't submit: ${error.message}` } };
  screenSoon();
  redirect(`/applications/${appId}?submitted=1`);
}

/** Uploads the coin's image to the public bucket and points the application at it. */
export async function uploadProjectImage(appId: string, formData: FormData): Promise<{ error?: string; path?: string }> {
  const user = await requireUser();
  if (!isUuid(appId)) return { error: "Unknown application." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Images must be 2 MB or smaller." };
  const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[file.type];
  if (!ext || !(IMAGE_MIME as readonly string[]).includes(file.type)) return { error: "Use a PNG, JPEG, WebP or GIF." };

  const supabase = await createClient();
  const { data: app } = await supabase.from("applications").select("applicant_id, status").eq("id", appId).maybeSingle();
  if (!app || app.applicant_id !== user.id) return { error: "Application not found." };
  if (!EDITABLE.includes(app.status)) return { error: "This application is locked while it's being reviewed." };

  const path = `${user.id}/${appId}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from("project-images").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) return { error: `Upload failed: ${up.error.message}` };
  const { error } = await supabase.from("applications").update({ image_path: path }).eq("id", appId);
  if (error) return { error: `Couldn't save the image: ${error.message}` };
  revalidatePath(`/applications/${appId}/edit`);
  return { path };
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
