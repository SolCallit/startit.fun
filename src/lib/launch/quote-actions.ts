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

/**
 * Pulls every quote token Raydium has a LaunchLab config for on this network and lists it for applicants.
 * Listing doesn't allow it on our platform: that still takes the admin's allow transaction before a launch.
 */
export async function syncPairs(network: "devnet" | "mainnet" = "devnet"): Promise<Result<{ found: number; added: number; updated: number; delisted: number }>> {
  try {
    const user = await requireAdmin();
    const { buildCatalog } = await import("./pair-catalog");
    const catalog = await buildCatalog(network);
    const net = network === "devnet" ? "solana-devnet" : "solana-mainnet";
    const { Connection, clusterApiUrl } = await import("@solana/web3.js");
    const conn = network === "devnet" ? connection() : new Connection(process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta"), "confirmed");

    // Decimals and token program from the chain where Jupiter didn't know the token.
    const missing = catalog.filter((c) => c.decimals === null || !c.tokenProgram);
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      const infos = await conn.getMultipleParsedAccounts(batch.map((c) => new PublicKey(c.mint)));
      infos.value.forEach((info, k) => {
        const parsed = (info?.data as { parsed?: { info?: { decimals?: number } } } | undefined)?.parsed;
        if (parsed?.info?.decimals !== undefined) batch[k]!.decimals = parsed.info.decimals;
        if (info) batch[k]!.tokenProgram = info.owner.toBase58();
      });
    }

    const supabase = await createClient();
    const { data: existing } = await supabase.from("quote_tokens").select("mint, listed, network");
    // A mint already stored for the other network keeps its row (e.g. SOL).
    const otherNet = new Set((existing ?? []).filter((r) => r.network !== net).map((r) => r.mint as string));
    const known = new Map((existing ?? []).filter((r) => r.network === net).map((r) => [r.mint as string, r.listed as boolean]));
    const now = new Date().toISOString();
    const rows = catalog
      .filter((c) => c.decimals !== null && c.decimals <= 12 && !otherNet.has(c.mint))
      .map((c) => ({
        mint: c.mint,
        symbol: c.symbol.replace(/[^A-Za-z0-9.]/g, "").slice(0, 12) || c.mint.slice(0, 4),
        name: c.name.trim().slice(0, 60) || c.mint.slice(0, 8),
        decimals: c.decimals!,
        network: net,
        launchlab_config_id: c.configId,
        category: c.category,
        logo_url: c.logoUrl,
        token_program: c.tokenProgram,
        listed: true,
        synced_at: now,
      }));
    let added = 0, updated = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      added += chunk.filter((r) => !known.has(r.mint)).length;
      updated += chunk.filter((r) => known.has(r.mint)).length;
      // New rows start disabled (not allow-listed); existing rows keep their enabled / allow state.
      // Two calls so every row in a batch has the same columns (mixed rows send NULL for the missing ones).
      const fresh = chunk.filter((r) => !known.has(r.mint)).map((r) => ({ ...r, enabled: false, added_by: user.id }));
      const seen = chunk.filter((r) => known.has(r.mint));
      if (fresh.length) {
        const { error } = await supabase.from("quote_tokens").insert(fresh);
        if (error) throw new Error(error.message);
      }
      if (seen.length) {
        const { error } = await supabase.from("quote_tokens").upsert(seen, { onConflict: "mint" });
        if (error) throw new Error(error.message);
      }
    }
    // Configs that disappeared on-chain stop being offered.
    const live = new Set(rows.map((r) => r.mint));
    const gone = [...known.keys()].filter((m) => !live.has(m) && m !== SOL_MINT && known.get(m));
    if (gone.length) await supabase.from("quote_tokens").update({ listed: false }).in("mint", gone);

    revalidatePath("/admin/settings");
    revalidatePath("/home");
    return { ok: true, found: catalog.length, added, updated, delisted: gone.length };
  } catch (e) { return fail(e); }
}

/** Show or hide a listed pair for applicants. */
export async function setQuoteListed(mint: string, listed: boolean): Promise<Result<object>> {
  try {
    await requireAdmin();
    if (mint === SOL_MINT && !listed) throw new Error("SOL is the default pair and stays listed.");
    const supabase = await createClient();
    const { error } = await supabase.from("quote_tokens").update({ listed }).eq("mint", mint);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) { return fail(e); }
}
