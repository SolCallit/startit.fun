"use server";

import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assertMatchesConfirmed, evaluateMintState, summarizeTransaction } from "./chain-checks";
import {
  buildCreatePlatformTx, buildLaunchTx, buildRedirectCpCreatorTx, connection, LAUNCHLAB_AUTH, LAUNCHLAB_PROGRAM, platformIdFor, readMint,
} from "./launchlab";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const pk = (v: string, label: string) => { try { return new PublicKey(v); } catch { throw new Error(`${label} is not a valid Solana address.`); } };
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://startit.fun").replace(/\/$/, "");

async function getSetting(key: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

// ───────────── One-time platform setup (admin) ─────────────

export async function preparePlatformSetup(adminWallet: string, step: "create" | "redirect"): Promise<Result<{ txBase64: string; summary: ReturnType<typeof summarizeTransaction>; detail: string }>> {
  try {
    const user = await requireStaff();
    if (!user.roles.includes("admin")) throw new Error("Only admins can set up the LaunchLab platform.");
    const router = await getSetting("fee_router_address");
    if (!router) throw new Error("Set the Fee Router address first.");
    const admin = pk(adminWallet, "Admin wallet");
    if (step === "create") {
      const b = await buildCreatePlatformTx({ admin, feeRouter: pk(router, "Fee Router"), siteUrl: siteUrl(), imageUrl: `${siteUrl()}/icon.svg` });
      const tx = VersionedTransaction.deserialize(Buffer.from(b.txBase64, "base64"));
      return { ok: true, txBase64: b.txBase64, summary: summarizeTransaction(tx),
        detail: `Raydium's own trade fee is ${b.raydiumTradeFeeRate / 10_000}%. Startit's platform fee will be ${b.feeRate / 10_000}%, so traders pay ${(b.raydiumTradeFeeRate + b.feeRate) / 10_000}% in total. 100% of the post-graduation LP-fee share goes to the Fee Router. Platform ${b.platformId}.` };
    }
    const b = await buildRedirectCpCreatorTx({ admin, feeRouter: pk(router, "Fee Router") });
    const tx = VersionedTransaction.deserialize(Buffer.from(b.txBase64, "base64"));
    return { ok: true, txBase64: b.txBase64, summary: summarizeTransaction(tx), detail: `Post-graduation CPMM creator fees will go to the Fee Router ${router}.` };
  } catch (e) { return fail(e); }
}

const ALLOWED_SETUP_PROGRAMS = new Set([LAUNCHLAB_PROGRAM.toBase58(), ComputeBudgetProgram.programId.toBase58(), SystemProgram.programId.toBase58()]);

export async function sendPlatformSetup(adminWallet: string, step: "create" | "redirect", signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    const user = await requireStaff();
    if (!user.roles.includes("admin")) throw new Error("Only admins can set up the LaunchLab platform.");
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    const s = summarizeTransaction(tx);
    if (s.feePayer !== adminWallet) throw new Error("The transaction's fee payer isn't the connected admin wallet.");
    if (s.programs.some((p) => !ALLOWED_SETUP_PROGRAMS.has(p))) throw new Error(`Unexpected program in setup transaction: ${s.programs.join(", ")}`);
    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const latest = await conn.getLatestBlockhash("confirmed");
    const conf = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (conf.value.err) throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);

    const supabase = await createClient();
    const rows = step === "create"
      ? [{ key: "launchlab_platform_id", value: platformIdFor(pk(adminWallet, "Admin wallet")).toBase58() }, { key: "launchlab_admin", value: adminWallet }]
      : [{ key: "launchlab_cp_creator_redirected", value: signature }];
    const { error } = await supabase.from("platform_settings").upsert(rows.map((r) => ({ ...r, updated_by: user.id, updated_at: new Date().toISOString() })));
    if (error) throw new Error(`Sent (${signature}) but couldn't save the setting: ${error.message}`);
    revalidatePath("/admin/settings");
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}

// ───────────── Per-launch flow (operator) ─────────────

export type LaunchPreview = { txBase64: string; summary: ReturnType<typeof summarizeTransaction>; poolId: string; mint: string };

/** Step 1: build the exact transaction and record what the operator will be asked to confirm. */
export async function prepareLaunch(appId: string, operatorWallet: string, mintPubkey: string): Promise<Result<LaunchPreview>> {
  try {
    await requireStaff();
    if (!isUuid(appId)) throw new Error("Unknown application.");
    const supabase = await createClient();
    const [{ data: app }, { data: launch }] = await Promise.all([
      supabase.from("applications").select("status, public_ref, token_name, ticker").eq("id", appId).single(),
      supabase.from("launches").select("id, status, decimals, total_supply_raw, network, founder_confirmed_at, tx_signature, verification, quote_mint").eq("application_id", appId).single(),
    ]);
    if (!app || !launch) throw new Error("Launch configuration not found.");
    if (app.status !== "ready_for_deployment") throw new Error("The application must be ready for deployment.");
    if (launch.network !== "solana-devnet") throw new Error("Only devnet launches are enabled.");
    if (!launch.founder_confirmed_at) throw new Error("The founder hasn't signed the terms.");
    if (!["planned", "previewed", "operator_confirmed", "failed"].includes(launch.status)) throw new Error(`Launch is already ${launch.status}.`);
    // A failed launch can be retried only if the previous transaction itself failed. If a token was created but
    // didn't match the terms, launching again would create a second token: suspend and investigate instead.
    if (launch.status === "failed" && launch.tx_signature && !(launch.verification as { txErr?: unknown } | null)?.txErr) {
      throw new Error("A token was already created by the previous attempt but didn't match the terms. Suspend the application and investigate before trying again.");
    }
    const platformId = await getSetting("launchlab_platform_id");
    if (!platformId) throw new Error("The LaunchLab platform hasn't been set up yet (Platform settings).");

    const { tx, poolId } = await buildLaunchTx({
      operator: pk(operatorWallet, "Operator wallet"), mint: pk(mintPubkey, "Mint"), platformId: pk(platformId, "Platform"),
      name: app.token_name, symbol: app.ticker, uri: `${siteUrl()}/api/token-metadata/${app.public_ref}`,
      decimals: launch.decimals, supplyRaw: String(launch.total_supply_raw),
      quoteMint: launch.quote_mint ? pk(launch.quote_mint, "Quote token") : undefined,
    });
    const summary = summarizeTransaction(tx);
    if (!summary.requiredSigners.includes(mintPubkey) || summary.feePayer !== operatorWallet) {
      throw new Error("The built transaction doesn't have the expected signers.");
    }
    const txBase64 = Buffer.from(tx.serialize()).toString("base64");
    const { error } = await supabase.from("launches").update({
      status: "previewed", previewed_at: new Date().toISOString(), preview_message_sha256: summary.messageSha256,
      tx_preview: { ...summary, poolId, mint: mintPubkey, platformId, operatorWallet }, mint_address: mintPubkey,
      launchlab_pool_address: poolId, launchlab_platform_id: platformId, operator_confirmed_at: null, operator_confirmed_by: null, error: null,
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    return { ok: true, txBase64, summary, poolId, mint: mintPubkey };
  } catch (e) { return fail(e); }
}

/** Step 2: the human confirmation, bound to the exact message hash that was previewed. */
export async function confirmLaunch(appId: string, messageSha: string): Promise<Result<object>> {
  try {
    const staff = await requireStaff();
    const supabase = await createClient();
    const { data: launch } = await supabase.from("launches").select("id, status, preview_message_sha256").eq("application_id", appId).single();
    if (!launch || launch.status !== "previewed") throw new Error("Prepare the launch first.");
    if (launch.preview_message_sha256 !== messageSha) throw new Error("This isn't the transaction that was previewed. Prepare it again.");
    const { error } = await supabase.from("launches").update({
      status: "operator_confirmed", operator_confirmed_by: staff.id, operator_confirmed_at: new Date().toISOString(),
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Step 3: broadcast — only the byte-identical, fully-signed transaction that was confirmed. */
export async function submitLaunch(appId: string, signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    await requireStaff();
    const supabase = await createClient();
    const { data: launch } = await supabase.from("launches").select("id, status, preview_message_sha256").eq("application_id", appId).single();
    if (!launch || launch.status !== "operator_confirmed") throw new Error("The launch must be confirmed first.");
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    assertMatchesConfirmed(tx, launch.preview_message_sha256);

    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const { error } = await supabase.from("launches").update({ status: "submitted", tx_signature: signature, submitted_at: new Date().toISOString() }).eq("id", launch.id);
    if (error) throw new Error(`Broadcast ${signature} but couldn't record it: ${error.message}`);
    revalidatePath(`/admin/applications/${appId}/launch`);
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}

/** Step 4: check the chain, not our own records. Only a passing check marks the application launched. */
export async function verifyLaunch(appId: string): Promise<Result<{ problems: string[] }>> {
  try {
    await requireStaff();
    const supabase = await createClient();
    const { data: launch } = await supabase.from("launches")
      .select("id, status, tx_signature, mint_address, launchlab_pool_address, total_supply_raw, decimals").eq("application_id", appId).single();
    if (!launch || launch.status !== "submitted" || !launch.tx_signature) throw new Error("Nothing submitted to verify.");

    const conn = connection();
    const txInfo = await conn.getTransaction(launch.tx_signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!txInfo) return { ok: true, problems: ["Transaction not confirmed yet. Try again in a few seconds."] };
    if (txInfo.meta?.err) {
      await supabase.from("launches").update({ status: "failed", error: `On-chain error: ${JSON.stringify(txInfo.meta.err)}`, verification: { txErr: txInfo.meta.err } }).eq("id", launch.id);
      return { ok: true, problems: [`The transaction failed on-chain: ${JSON.stringify(txInfo.meta.err)}. You can prepare it again.`] };
    }

    const mint = await readMint(new PublicKey(launch.mint_address));
    const pool = await conn.getAccountInfo(new PublicKey(launch.launchlab_pool_address), "confirmed");
    const check = evaluateMintState(mint, { supplyRaw: String(launch.total_supply_raw), decimals: launch.decimals, allowedMintAuthorities: [LAUNCHLAB_AUTH.toBase58()] });
    const problems = [...check.problems];
    if (!pool || !pool.owner.equals(LAUNCHLAB_PROGRAM)) problems.push("The bonding-curve pool account isn't owned by the LaunchLab program.");

    const verification = { slot: txInfo.slot, blockTime: txInfo.blockTime, mint, poolOwner: pool?.owner.toBase58() ?? null, problems };
    if (problems.length) {
      // Token exists but doesn't match the signed terms: record it loudly; don't mark launched.
      await supabase.from("launches").update({ status: "failed", error: problems.join(" "), verification }).eq("id", launch.id);
      return { ok: true, problems };
    }
    const { error } = await supabase.from("launches").update({
      status: "finalized", verified_at: new Date().toISOString(), finalized_slot: txInfo.slot,
      verified_mint_authority: mint.mintAuthority, verified_freeze_authority: mint.freezeAuthority, verified_supply_raw: mint.supplyRaw, verification,
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    const t = await supabase.rpc("transition_application", { p_app: appId, p_to: "launched", p_reason: `Verified on-chain: ${launch.tx_signature}` });
    if (t.error) throw new Error(t.error.message);
    revalidatePath(`/admin/applications/${appId}/launch`);
    return { ok: true, problems: [] };
  } catch (e) { return fail(e); }
}
