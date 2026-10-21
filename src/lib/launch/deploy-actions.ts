"use server";

import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction, ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { summarizeTransaction } from "./chain-checks";
import { buildCreatePlatformTx, buildRedirectCpCreatorTx, connection, LAUNCHLAB_PROGRAM, platformIdFor } from "./launchlab";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
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

// ───────────── Per-launch flow ─────────────
// The launcher signs the launch (with their starter's buy) after an admin approves it: see ./self-launch.ts.
