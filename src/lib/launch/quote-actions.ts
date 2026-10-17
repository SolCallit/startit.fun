"use server";

import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { summarizeTransaction } from "./chain-checks";
import { allowConfigIdFor, buildAllowQuoteTx, connection, LAUNCHLAB_PROGRAM, readQuoteConfig, SOL_MINT } from "./launchlab";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const pk = (v: string, label: string) => { try { return new PublicKey(v.trim()); } catch { throw new Error(`${label} is not a valid Solana address.`); } };

async function requireAdmin() {
  const user = await requireStaff();
  if (!user.roles.includes("admin")) throw new Error("Only admins can change quote tokens.");
  return user;
}
async function platformId() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "launchlab_platform_id").maybeSingle();
  if (!data?.value) throw new Error("Set up the LaunchLab platform first.");
  return pk(String(data.value), "Platform");
}

/** Adds a quote token after checking on-chain that Raydium has a LaunchLab config for it. Starts disabled. */
export async function addQuoteToken(_prev: unknown, form: FormData): Promise<Result<{ message: string }>> {
  try {
    const user = await requireAdmin();
    const mint = pk(String(form.get("mint") ?? ""), "Mint");
    const symbol = String(form.get("symbol") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    if (!/^[A-Za-z0-9.]{1,12}$/.test(symbol)) throw new Error("Symbol must be 1–12 letters, numbers or dots.");
    if (!name || name.length > 60) throw new Error("Give the token a name (up to 60 characters).");
    const cfg = await readQuoteConfig(mint);
    const supabase = await createClient();
    const { error } = await supabase.from("quote_tokens").insert({
      mint: mint.toBase58(), symbol, name, decimals: cfg.decimals, network: "solana-devnet",
      launchlab_config_id: cfg.configId, enabled: false, added_by: user.id,
    });
    if (error) throw new Error(error.code === "23505" ? "That token is already on the list." : error.message);
    revalidatePath("/admin/settings");
    return { ok: true, message: `${symbol} added. Raydium's config ${cfg.configId} exists. Allow it on our platform, then switch it on.` };
  } catch (e) { return fail(e); }
}

/** Builds the createPlatformAllowConfig transaction for the platform admin's wallet to sign. */
export async function prepareAllowQuote(mint: string, adminWallet: string): Promise<Result<{ txBase64: string; summary: ReturnType<typeof summarizeTransaction> }>> {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data: q } = await supabase.from("quote_tokens").select("launchlab_config_id").eq("mint", mint).maybeSingle();
    if (!q) throw new Error("Unknown quote token.");
    const b = await buildAllowQuoteTx({ admin: pk(adminWallet, "Admin wallet"), platformId: await platformId(), configId: pk(q.launchlab_config_id, "Config") });
    return { ok: true, txBase64: b.txBase64, summary: summarizeTransaction(VersionedTransaction.deserialize(Buffer.from(b.txBase64, "base64"))) };
  } catch (e) { return fail(e); }
}

/** Sends the signed allow-config transaction, then records it only once the account exists on-chain. */
export async function sendAllowQuote(mint: string, adminWallet: string, signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data: q } = await supabase.from("quote_tokens").select("launchlab_config_id").eq("mint", mint).maybeSingle();
    if (!q) throw new Error("Unknown quote token.");
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    const s = summarizeTransaction(tx);
    if (s.feePayer !== adminWallet) throw new Error("The fee payer isn't the connected admin wallet.");
    if (s.programs.some((p) => p !== LAUNCHLAB_PROGRAM.toBase58())) throw new Error(`Unexpected program: ${s.programs.join(", ")}`);
    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const latest = await conn.getLatestBlockhash("confirmed");
    const conf = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (conf.value.err) throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);
    const allow = allowConfigIdFor(await platformId(), pk(q.launchlab_config_id, "Config"));
    if (!(await conn.getAccountInfo(allow, "confirmed"))) throw new Error(`Sent (${signature}) but the allow-config account isn't on-chain yet. Try again shortly.`);
    const { error } = await supabase.from("quote_tokens")
      .update({ platform_allow_config: allow.toBase58(), platform_allowed_at: new Date().toISOString() }).eq("mint", mint);
    if (error) throw new Error(`Allowed on-chain (${signature}) but couldn't save: ${error.message}`);
    revalidatePath("/admin/settings");
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}

/** Switch a quote token on or off for new applications. The database refuses "on" until it's allow-listed. */
export async function setQuoteEnabled(mint: string, enabled: boolean): Promise<Result<object>> {
  try {
    await requireAdmin();
    if (mint === SOL_MINT && !enabled) throw new Error("SOL is the default pair and stays on.");
    const supabase = await createClient();
    const { error } = await supabase.from("quote_tokens").update({ enabled }).eq("mint", mint);
    if (error) throw new Error(error.code === "23514" ? "Allow it on our LaunchLab platform first." : error.message);
    revalidatePath("/admin/settings");
    revalidatePath("/home");
    return { ok: true };
  } catch (e) { return fail(e); }
}
