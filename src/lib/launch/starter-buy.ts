"use server";

import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { summarizeTransaction } from "./chain-checks";
import { buildStarterBuyTx, connection, LAUNCHLAB_PROGRAM, SOL_MINT } from "./launchlab";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// Programs a starter's buy may touch: LaunchLab, plus the system, token, ATA and compute-budget plumbing around it.
const ALLOWED = new Set([
  LAUNCHLAB_PROGRAM.toBase58(),
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
]);

/** Loads what the caller may buy: only the applicant, only after a finalized launch, only up to the disclosed amount, once. */
async function loadBuy(appId: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(appId)) throw new Error("Unknown application.");
  const supabase = await createClient();
  const { data: app } = await supabase.from("applications").select("id, applicant_id, status, applicant_is_founder").eq("id", appId).maybeSingle();
  if (!app || app.applicant_id !== user.id) throw new Error("Only the person who launched this can make the starter's buy.");
  if (app.status !== "launched") throw new Error("The coin isn't live yet.");
  const svc = createServiceClient();
  const { data: launch } = await svc.from("launches")
    .select("id, status, mint_address, quote_mint, starter_buy_amount, starter_buy_tx, founder_wallet, launcher_wallet")
    .eq("application_id", appId).single();
  if (!launch || launch.status !== "finalized" || !launch.mint_address) throw new Error("The launch hasn't been verified on-chain yet.");
  if (Number(launch.starter_buy_amount) <= 0) throw new Error("No starter's buy was disclosed for this launch.");
  if (launch.starter_buy_tx) throw new Error("The starter's buy is already done.");
  const buyer = app.applicant_is_founder ? launch.founder_wallet : launch.launcher_wallet;
  if (!buyer) throw new Error("No payout wallet is on the signed terms.");
  const quoteMint = launch.quote_mint ?? SOL_MINT;
  const { data: q } = await svc.from("quote_tokens").select("decimals, symbol").eq("mint", quoteMint).single();
  return { svc, launch, buyer, quoteMint, decimals: q?.decimals ?? 9, symbol: q?.symbol ?? "SOL" };
}

function toRaw(amount: string | number, decimals: number) {
  const [w, f = ""] = String(amount).split(".");
  return (BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

export async function prepareStarterBuy(appId: string, wallet: string): Promise<Result<{ txBase64: string; amount: string; symbol: string }>> {
  try {
    const b = await loadBuy(appId);
    if (wallet !== b.buyer) throw new Error(`Connect the wallet on the signed terms (${b.buyer.slice(0, 4)}…${b.buyer.slice(-4)}).`);
    const tx = await buildStarterBuyTx({
      buyer: new PublicKey(b.buyer), mint: new PublicKey(b.launch.mint_address!), quoteMint: new PublicKey(b.quoteMint),
      amountRaw: toRaw(b.launch.starter_buy_amount, b.decimals),
    });
    return { ok: true, txBase64: Buffer.from(tx.serialize()).toString("base64"), amount: String(Number(b.launch.starter_buy_amount)), symbol: b.symbol };
  } catch (e) { return fail(e); }
}

export async function sendStarterBuy(appId: string, signedBase64: string): Promise<Result<{ signature: string }>> {
  try {
    const b = await loadBuy(appId);
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    const s = summarizeTransaction(tx);
    if (s.feePayer !== b.buyer) throw new Error("This transaction isn't paid by the wallet on the signed terms.");
    if (!s.programs.includes(LAUNCHLAB_PROGRAM.toBase58()) || s.programs.some((p) => !ALLOWED.has(p))) throw new Error("That isn't a plain LaunchLab buy.");
    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const latest = await conn.getLatestBlockhash("confirmed");
    const conf = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (conf.value.err) throw new Error(`The buy failed on-chain: ${JSON.stringify(conf.value.err)}`);
    const { error } = await b.svc.from("launches").update({ starter_buy_tx: signature, starter_buy_at: new Date().toISOString() }).eq("id", b.launch.id);
    if (error) throw new Error(`Bought (${signature}) but couldn't record it: ${error.message}`);
    revalidatePath(`/applications/${appId}`);
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}
