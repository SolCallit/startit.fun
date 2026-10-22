"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { flattenErrors } from "@/lib/applications/schema";
import { DEFAULT_DECIMALS, DEFAULT_SUPPLY, launchConfigSchema, parseAllocations, parseSigners, SIGNING_LINK_TTL_DAYS, wholeToRaw } from "./config";
import { renderLaunchTerms, sha256Hex, signingMessage, verifyWalletSignature, type SignerRole } from "./terms";

export type ConfigState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const raw = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

/**
 * Saves the operator's launch configuration: approves the fee split (a new immutable fee_config row whenever it
 * changes), sets wallets and treasury, and regenerates the exact terms text + hash. Changing anything after
 * signatures exist changes the hash, which voids earlier signatures automatically.
 */
export async function saveLaunchConfig(appId: string, _prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const staff = await requireStaff();
  const values = raw(formData);
  if (!isUuid(appId)) return { errors: { _form: "Unknown application." }, values };
  const parsed = launchConfigSchema.safeParse(values);
  if (!parsed.success) return { errors: flattenErrors(parsed.error), values };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: app } = await supabase.from("applications")
    .select("id, public_ref, status, project_name, token_name, ticker, permitted_branding, applicant_is_founder, quote_mint, starter_buy_amount").eq("id", appId).maybeSingle();
  if (!app) return { errors: { _form: "Application not found." }, values };
  const quoteMint = app.quote_mint ?? "So11111111111111111111111111111111111111112";
  const { data: quote } = await supabase.from("quote_tokens").select("mint, symbol, enabled").eq("mint", quoteMint).maybeSingle();
  if (!quote?.enabled) return { errors: { _form: "The pair this application chose isn't enabled on the platform. Enable it in Platform settings or ask the starter to pick another." }, values };
  if (app.status !== "launch_config_pending") return { errors: { _form: "Launch settings can only change while configuration is pending." }, values };
  if (app.applicant_is_founder && v.launcher_bps > 0) return { errors: { launcher_bps: "The brand submitted this themselves, so there's no starter share." }, values };

  const { data: router } = await supabase.from("platform_settings").select("value").eq("key", "fee_router_address").maybeSingle();
  if (!router) return { errors: { _form: "An admin must set the Fee Router address in Platform settings first." }, values };

  const { data: existingLaunch } = await supabase.from("launches").select("id, fee_config_id").eq("application_id", appId).maybeSingle();

  // Fee config: reuse the current one if identical, otherwise create a new approved row (approved rows are immutable).
  let feeConfigId = existingLaunch?.fee_config_id as string | undefined;
  const { data: currentFc } = feeConfigId
    ? await supabase.from("fee_configs").select("platform_bps, founder_bps, launcher_bps, community_bps, deviation_reason").eq("id", feeConfigId).single()
    : { data: null };
  const sameSplit = currentFc && currentFc.platform_bps === v.platform_bps && currentFc.founder_bps === v.founder_bps
    && currentFc.launcher_bps === v.launcher_bps && currentFc.community_bps === v.community_bps
    && (currentFc.deviation_reason ?? "") === v.deviation_reason;
  if (!sameSplit) {
    const { data: fc, error } = await supabase.from("fee_configs").insert({
      application_id: appId, platform_bps: v.platform_bps, founder_bps: v.founder_bps, launcher_bps: v.launcher_bps,
      community_bps: v.community_bps, deviation_reason: v.deviation_reason || null, approved_by: staff.id, approved_at: new Date().toISOString(),
    }).select("id").single();
    if (error) return { errors: { _form: `Couldn't approve the fee split: ${error.message}` }, values };
    feeConfigId = fc.id;
  }

  const isMultisig = v.treasury_is_multisig === "yes";
  const signers = isMultisig ? parseSigners(v.treasury_signers) : [];
  const threshold = isMultisig ? Number(v.treasury_threshold) : null;
  const allocations = parseAllocations(v.insider_allocations) ?? [];

  const termsText = renderLaunchTerms({
    publicRef: app.public_ref, projectName: app.project_name, tokenName: app.token_name, ticker: app.ticker,
    network: "solana-devnet", totalSupply: DEFAULT_SUPPLY, decimals: DEFAULT_DECIMALS,
    mintAuthorityRevoked: true, freezeAuthorityRevoked: true, insiderAllocations: allocations,
    split: { platformBps: v.platform_bps, founderBps: v.founder_bps, launcherBps: v.launcher_bps, communityBps: v.community_bps },
    deviationReason: v.deviation_reason || null,
    wallets: { founder: v.founder_wallet, launcher: v.launcher_wallet || null, communityTreasury: v.treasury_address, feeRouter: router.value },
    treasury: { isMultisig, threshold, signers, controlRules: v.treasury_rules },
    permittedBranding: app.permitted_branding ?? "",
    quote: { symbol: quote.symbol, mint: quote.mint },
    starterBuy: { amount: String(Number(app.starter_buy_amount ?? 0)), symbol: quote.symbol, wallet: app.applicant_is_founder ? v.founder_wallet : v.launcher_wallet || null },
  });
  const termsSha = await sha256Hex(termsText);

  const launchRow = {
    application_id: appId, fee_config_id: feeConfigId, network: "solana-devnet",
    total_supply_raw: wholeToRaw(DEFAULT_SUPPLY, DEFAULT_DECIMALS), decimals: DEFAULT_DECIMALS,
    mint_authority_revoked: true, freeze_authority_revoked: true, insider_allocations: allocations,
    founder_wallet: v.founder_wallet, launcher_wallet: v.launcher_wallet || null, terms_text: termsText, terms_sha256: termsSha,
    quote_mint: quote.mint,
    starter_buy_amount: Number(app.starter_buy_amount ?? 0),
  };
  const lr = existingLaunch
    ? await supabase.from("launches").update(launchRow).eq("id", existingLaunch.id)
    : await supabase.from("launches").insert(launchRow);
  if (lr.error) return { errors: { _form: `Couldn't save launch settings: ${lr.error.message}` }, values };

  const tr = await supabase.from("treasuries").upsert({
    application_id: appId, address: v.treasury_address, is_multisig: isMultisig, threshold, signers, control_rules: v.treasury_rules,
  }, { onConflict: "application_id" });
  if (tr.error) return { errors: { _form: `Couldn't save the treasury: ${tr.error.message}` }, values };

  revalidatePath(`/admin/applications/${appId}/launch`);
  return { message: `Saved. Terms hash ${termsSha.slice(0, 12)}… — any earlier signatures over different terms no longer count.`, values };
}

export type LinkState = { error?: string; url?: string; role?: SignerRole };

/** Creates a one-time signing link. Only a SHA-256 of the token is stored; the link is shown once. */
export async function createSigningLink(appId: string, role: SignerRole, _prev: LinkState): Promise<LinkState> {
  const staff = await requireStaff();
  if (!isUuid(appId)) return { error: "Unknown application." };
  const supabase = await createClient();
  const { data: launch } = await supabase.from("launches").select("id, terms_sha256, founder_wallet, launcher_wallet").eq("application_id", appId).maybeSingle();
  if (!launch?.terms_sha256) return { error: "Save the launch settings first." };
  const expected = role === "founder" ? launch.founder_wallet : launch.launcher_wallet;
  if (!expected) return { error: `No ${role} wallet is set.` };

  await supabase.from("signing_requests").update({ revoked_at: new Date().toISOString() })
    .eq("application_id", appId).eq("role", role).is("used_at", null).is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("signing_requests").insert({
    application_id: appId, launch_id: launch.id, role, token_sha256: createHash("sha256").update(token).digest("hex"),
    terms_sha256: launch.terms_sha256, expected_wallet: expected, created_by: staff.id,
    expires_at: new Date(Date.now() + SIGNING_LINK_TTL_DAYS * 86_400_000).toISOString(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/applications/${appId}/launch`);
  return { url: `/sign/${token}`, role };
}

export type PublicSigningRequest = {
  role: SignerRole; publicRef: string; projectName: string; ticker: string;
  termsText: string; termsSha256: string; expectedWallet: string; expiresAt: string;
};

/** Looks up a signing link. Runs with the service role, so it validates the token itself. */
export async function loadSigningRequest(token: string): Promise<{ ok: true; req: PublicSigningRequest } | { ok: false; reason: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, reason: "This signing link isn't valid." };
  const svc = createServiceClient();
  const { data: r } = await svc.from("signing_requests")
    .select("id, role, terms_sha256, expected_wallet, expires_at, used_at, revoked_at, launch_id, application_id")
    .eq("token_sha256", createHash("sha256").update(token).digest("hex")).maybeSingle();
  if (!r) return { ok: false, reason: "This signing link isn't valid." };
  if (r.used_at) return { ok: false, reason: "These terms have already been signed with this link." };
  if (r.revoked_at) return { ok: false, reason: "This link was replaced by a newer one. Ask Startit for the latest link." };
  if (Date.parse(r.expires_at) < Date.now()) return { ok: false, reason: "This link has expired. Ask Startit for a new one." };

  const [{ data: launch }, { data: app }] = await Promise.all([
    svc.from("launches").select("terms_text, terms_sha256").eq("id", r.launch_id).single(),
    svc.from("applications").select("public_ref, project_name, ticker, status").eq("id", r.application_id).single(),
  ]);
  if (!launch || !app) return { ok: false, reason: "This signing link isn't valid." };
  if (launch.terms_sha256 !== r.terms_sha256) return { ok: false, reason: "The launch terms changed after this link was created. Ask Startit for a new link." };
  if (app.status !== "launch_config_pending") return { ok: false, reason: "This launch is no longer accepting signatures." };

  return { ok: true, req: {
    role: r.role as SignerRole, publicRef: app.public_ref, projectName: app.project_name, ticker: app.ticker,
    termsText: launch.terms_text, termsSha256: launch.terms_sha256, expectedWallet: r.expected_wallet, expiresAt: r.expires_at,
  } };
}

export type SignResult = { ok: true } | { ok: false; error: string };

export async function submitSignature(token: string, input: { wallet: string; signature: string; issuedAt: string }): Promise<SignResult> {
  const loaded = await loadSigningRequest(token);
  if (!loaded.ok) return { ok: false, error: loaded.reason };
  const { req } = loaded;

  if (input.wallet !== req.expectedWallet) {
    return { ok: false, error: `This link must be signed by the wallet ending ${req.expectedWallet.slice(-6)}. You connected a different wallet.` };
  }
  const issued = Date.parse(input.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 15 * 60_000) {
    return { ok: false, error: "The signature is too old. Sign again." };
  }
  const message = signingMessage({ publicRef: req.publicRef, role: req.role, termsSha256: req.termsSha256, wallet: input.wallet, issuedAt: input.issuedAt });
  if (!verifyWalletSignature(message, input.signature, input.wallet)) {
    return { ok: false, error: "The signature didn't verify. Make sure you approve the message in your wallet." };
  }

  const svc = createServiceClient();
  const tokenSha = createHash("sha256").update(token).digest("hex");
  // Claim the link first so a replay can't record twice.
  const { data: claimed } = await svc.from("signing_requests").update({ used_at: new Date().toISOString() })
    .eq("token_sha256", tokenSha).is("used_at", null).is("revoked_at", null).select("application_id").maybeSingle();
  if (!claimed) return { ok: false, error: "This link has already been used." };

  const { error } = await svc.from("agreements").insert({
    application_id: claimed.application_id,
    kind: req.role === "founder" ? "founder_agreement" : "launcher_agreement",
    version: req.termsSha256.slice(0, 12),
    document_sha256: req.termsSha256,
    signer_role: req.role,
    signer_wallet: input.wallet,
    wallet_signature: input.signature,
    signed_message: message,
    signed_at: new Date().toISOString(),
  });
  if (error) {
    await svc.from("signing_requests").update({ used_at: null }).eq("token_sha256", tokenSha);
    return { ok: false, error: `Couldn't record the signature: ${error.message}` };
  }
  if (req.role === "founder") {
    await svc.from("launches").update({ founder_confirmed_at: new Date().toISOString() }).eq("application_id", claimed.application_id);
  }
  return { ok: true };
}

export async function markReadyForDeployment(appId: string, _prev: ConfigState): Promise<ConfigState> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_application", { p_app: appId, p_to: "ready_for_deployment", p_reason: null });
  if (error) return { errors: { _form: error.message } };
  revalidatePath(`/admin/applications/${appId}/launch`);
  return { message: "Ready to launch. The fee split and signed terms are now public." };
}
