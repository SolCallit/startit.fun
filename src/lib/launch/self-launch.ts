"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { requireStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertMatchesConfirmed, evaluateMintState, summarizeTransaction } from "./chain-checks";
import { buildLaunchTx, connection, LAUNCHLAB_AUTH, LAUNCHLAB_PROGRAM, readMint, SOL_MINT } from "./launchlab";

/**
 * Starter-signed launch.
 * 1. An admin approves the exact launch parameters (the human gate before anything irreversible).
 * 2. The starter's wallet signs ONE transaction that creates the coin and makes their disclosed starter's buy.
 * 3. Anyone involved verifies it on-chain; only a passing check marks the coin launched.
 * Fees are unaffected by who signs: Startit's LaunchLab platform has a 0% creator fee and routes LP and
 * post-graduation creator fees to the Fee Router.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const pk = (v: string, label: string) => { try { return new PublicKey(v); } catch { throw new Error(`${label} is not a valid Solana address.`); } };
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://startit.fun").replace(/\/$/, "");

function toRaw(amount: string | number, decimals: number) {
  const [w, f = ""] = String(amount).split(".");
  return (BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

export type LaunchParams = {
  appId: string; name: string; symbol: string; uri: string; decimals: number; supplyRaw: string;
  quoteMint: string; quoteSymbol: string; platformId: string; signer: string; starterBuy: string; starterBuyRaw: string;
};

/** Reads everything the launch transaction is built from. Same inputs always give the same hash. */
async function loadParams(appId: string) {
  if (!isUuid(appId)) throw new Error("Unknown application.");
  const svc = createServiceClient();
  const [{ data: app }, { data: launch }, { data: platform }] = await Promise.all([
    svc.from("applications").select("id, applicant_id, status, public_ref, token_name, ticker, applicant_is_founder").eq("id", appId).single(),
    svc.from("launches").select("id, status, network, decimals, total_supply_raw, quote_mint, starter_buy_amount, founder_wallet, launcher_wallet, founder_confirmed_at, preview_message_sha256, signer_tx_sha256, tx_signature, verification, submitted_at")
      .eq("application_id", appId).single(),
    svc.from("platform_settings").select("value").eq("key", "launchlab_platform_id").maybeSingle(),
  ]);
  if (!app || !launch) throw new Error("Launch configuration not found.");
  if (!platform?.value) throw new Error("The LaunchLab platform hasn't been set up yet (Admin settings).");
  let signer = app.applicant_is_founder ? launch.founder_wallet : launch.launcher_wallet;
  if (!signer) {
    const { data: prof } = await svc.from("profiles").select("wallet_address").eq("id", app.applicant_id).single();
    signer = prof?.wallet_address ?? null;
  }
  if (!signer) throw new Error("No wallet to launch from: the starter has no wallet on the signed terms or their profile.");
  const quoteMint = launch.quote_mint ?? SOL_MINT;
  const { data: q } = await svc.from("quote_tokens").select("decimals, symbol").eq("mint", quoteMint).maybeSingle();
  const starterBuy = String(Number(launch.starter_buy_amount ?? 0));
  const params: LaunchParams = {
    appId, name: app.token_name, symbol: app.ticker, uri: `${siteUrl()}/api/token-metadata/${app.public_ref}`,
    decimals: launch.decimals, supplyRaw: String(launch.total_supply_raw), quoteMint, quoteSymbol: q?.symbol ?? "SOL",
    platformId: platform.value as string, signer, starterBuy, starterBuyRaw: toRaw(starterBuy, q?.decimals ?? 9),
  };
  const hash = createHash("sha256").update(JSON.stringify(params)).digest("hex");
  return { svc, app, launch, params, hash };
}

/** What the admin is about to approve, for display. */
export async function launchParamsFor(appId: string): Promise<Result<{ params: LaunchParams; approved: boolean }>> {
  try {
    await requireStaff();
    const { params, hash, launch } = await loadParams(appId);
    return { ok: true, params, approved: launch.status === "operator_confirmed" && launch.preview_message_sha256 === hash };
  } catch (e) { return fail(e); }
}

/** Step 1 (admin): approve the launch parameters. Nothing goes on-chain. */
export async function approveLaunch(appId: string): Promise<Result<object>> {
  try {
    const staff = await requireStaff();
    const { app, launch, hash, params } = await loadParams(appId);
    if (app.status !== "ready_for_deployment") throw new Error("The application must be ready to launch.");
    if (launch.network !== "solana-devnet") throw new Error("Only devnet launches are enabled.");
    if (!launch.founder_confirmed_at) throw new Error("The brand hasn't signed the terms.");
    if (!["planned", "previewed", "operator_confirmed"].includes(launch.status)) throw new Error(`Launch is already ${launch.status}.`);
    const supabase = await createClient();
    const { error } = await supabase.from("launches").update({
      status: "operator_confirmed", preview_message_sha256: hash, tx_preview: { kind: "launcher_signed", ...params },
      launch_signer: params.signer, operator_confirmed_by: staff.id, operator_confirmed_at: new Date().toISOString(), error: null,
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/applications/${appId}/launch`);
    revalidatePath(`/applications/${appId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Loads the launch for the person who launches it, checking the admin's approval still matches. */
async function loadForSigner(appId: string) {
  const user = await requireUser();
  const l = await loadParams(appId);
  if (l.app.applicant_id !== user.id) throw new Error("Only the person who submitted this coin can launch it.");
  if (l.app.status !== "ready_for_deployment") throw new Error(l.app.status === "launched" ? "This coin is already live." : "This coin isn't approved for launch yet.");
  if (l.launch.preview_message_sha256 !== l.hash) throw new Error("The launch details changed since the admin approved them. Ask the admin to approve again.");
  return l;
}

const retryable = (launch: { status: string; tx_signature: string | null; verification: unknown }) =>
  launch.status === "failed" && !!(launch.verification as { txErr?: unknown } | null)?.txErr;

/** Step 2a (starter): build the exact transaction for their wallet to sign. */
export async function prepareMyLaunch(appId: string, wallet: string, mintPubkey: string): Promise<Result<{ txBase64: string; poolId: string; params: LaunchParams }>> {
  try {
    const { svc, launch, params } = await loadForSigner(appId);
    if (!(launch.status === "operator_confirmed" || retryable(launch))) {
      throw new Error(launch.status === "submitted" ? "Your launch was sent. Check it below." : `Launch is ${launch.status}.`);
    }
    if (wallet !== params.signer) throw new Error(`Connect the wallet on the signed terms (${params.signer.slice(0, 4)}…${params.signer.slice(-4)}).`);
    const { tx, poolId } = await buildLaunchTx({
      operator: pk(wallet, "Wallet"), mint: pk(mintPubkey, "Mint"), platformId: pk(params.platformId, "Platform"),
      name: params.name, symbol: params.symbol, uri: params.uri, decimals: params.decimals, supplyRaw: params.supplyRaw,
      quoteMint: pk(params.quoteMint, "Quote token"), buyAmountRaw: params.starterBuyRaw,
    });
    const s = summarizeTransaction(tx);
    if (s.feePayer !== wallet || !s.requiredSigners.includes(mintPubkey)) throw new Error("The built transaction doesn't have the expected signers.");
    const { error } = await svc.from("launches").update({
      ...(launch.status === "failed" ? { status: "operator_confirmed" } : {}),
      signer_tx_sha256: s.messageSha256, mint_address: mintPubkey, launchlab_pool_address: poolId, launchlab_platform_id: params.platformId, error: null,
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    return { ok: true, txBase64: Buffer.from(tx.serialize()).toString("base64"), poolId, params };
  } catch (e) { return fail(e); }
}

/** Step 2b (starter): broadcast only the byte-identical transaction that was built for them, fully signed. */
export async function submitMyLaunch(appId: string, signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    const { svc, launch } = await loadForSigner(appId);
    if (launch.status !== "operator_confirmed" || !launch.signer_tx_sha256) throw new Error("Start the launch again.");
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    assertMatchesConfirmed(tx, launch.signer_tx_sha256);
    const signature = await connection().sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const { error } = await svc.from("launches").update({ status: "submitted", tx_signature: signature, submitted_at: new Date().toISOString() }).eq("id", launch.id);
    if (error) throw new Error(`Sent ${signature} but couldn't record it: ${error.message}`);
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}

/** Step 3 (starter or staff): check the chain, not our records. Marks the coin live and records the starter's buy. */
export async function verifyMyLaunch(appId: string): Promise<Result<{ problems: string[]; pending: boolean }>> {
  try {
    const user = await requireUser();
    const { svc, app, launch, params } = await loadParams(appId);
    const isStaff = user.roles.includes("admin") || user.roles.includes("operator");
    if (app.applicant_id !== user.id && !isStaff) throw new Error("Not your launch.");
    if (app.status === "launched") return { ok: true, problems: [], pending: false };
    if (launch.status !== "submitted" || !launch.tx_signature) throw new Error("Nothing sent to check.");

    const conn = connection();
    const txInfo = await conn.getTransaction(launch.tx_signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!txInfo) {
      const age = Date.now() - new Date(launch.submitted_at ?? 0).getTime();
      if (age > 120_000) {
        const st = await conn.getSignatureStatus(launch.tx_signature, { searchTransactionHistory: true });
        if (!st.value) {
          await svc.from("launches").update({ status: "failed", error: "The transaction expired before it landed.", verification: { txErr: "expired" } }).eq("id", launch.id);
          return { ok: true, pending: false, problems: ["The transaction expired before it landed. Nothing was created; press Launch again."] };
        }
      }
      return { ok: true, pending: true, problems: [] };
    }
    if (txInfo.meta?.err) {
      await svc.from("launches").update({ status: "failed", error: `On-chain error: ${JSON.stringify(txInfo.meta.err)}`, verification: { txErr: txInfo.meta.err } }).eq("id", launch.id);
      return { ok: true, pending: false, problems: [`The launch failed on-chain (${JSON.stringify(txInfo.meta.err)}). Nothing was created. Check your wallet has enough SOL for the starter's buy plus about 0.03 SOL, then try again.`] };
    }

    const { data: full } = await svc.from("launches").select("mint_address, launchlab_pool_address").eq("id", launch.id).single();
    const mint = await readMint(new PublicKey(full!.mint_address!));
    const pool = await conn.getAccountInfo(new PublicKey(full!.launchlab_pool_address!), "confirmed");
    const check = evaluateMintState(mint, { supplyRaw: params.supplyRaw, decimals: params.decimals, allowedMintAuthorities: [LAUNCHLAB_AUTH.toBase58()] });
    const problems = [...check.problems];
    if (!pool || !pool.owner.equals(LAUNCHLAB_PROGRAM)) problems.push("The bonding-curve pool account isn't owned by the LaunchLab program.");
    const verification = { slot: txInfo.slot, blockTime: txInfo.blockTime, mint, poolOwner: pool?.owner.toBase58() ?? null, signer: params.signer, problems };
    if (problems.length) {
      await svc.from("launches").update({ status: "failed", error: problems.join(" "), verification }).eq("id", launch.id);
      return { ok: true, pending: false, problems };
    }
    const now = new Date().toISOString();
    const bought = Number(params.starterBuy) > 0;
    const { error } = await svc.from("launches").update({
      status: "finalized", verified_at: now, finalized_slot: txInfo.slot,
      verified_mint_authority: mint.mintAuthority, verified_freeze_authority: mint.freezeAuthority, verified_supply_raw: mint.supplyRaw, verification,
      ...(bought ? { starter_buy_tx: launch.tx_signature, starter_buy_at: now } : {}),
    }).eq("id", launch.id);
    if (error) throw new Error(error.message);
    const supabase = await createClient();
    const t = await supabase.rpc("transition_application", { p_app: appId, p_to: "launched", p_reason: `Launched and verified on-chain: ${launch.tx_signature}` });
    if (t.error) throw new Error(t.error.message);
    revalidatePath(`/applications/${appId}`);
    revalidatePath(`/admin/applications/${appId}/launch`);
    revalidatePath(`/projects/${app.public_ref}`);
    return { ok: true, pending: false, problems: [] };
  } catch (e) { return fail(e); }
}
