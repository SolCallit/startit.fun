"use server";

import { revalidatePath } from "next/cache";
import { PublicKey, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSolanaAddress } from "@/lib/launch/terms";
import { connection } from "@/lib/launch/launchlab";
import { summarizeTransaction } from "@/lib/launch/chain-checks";
import { buildPayoutProposal, proposalTicket, SQUADS_PROGRAM, vaultOf } from "./squads";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

async function settings() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value");
  return (k: string) => data?.find((r) => r.key === k)?.value ?? null;
}

export type SettingState = { error?: string; message?: string };

/** Admin: multisig PDA (must derive the published Fee Router vault) and the platform's own payout wallet. */
export async function savePayoutSettings(_prev: SettingState, fd: FormData): Promise<SettingState> {
  const user = await requireStaff();
  if (!user.roles.includes("admin")) return { error: "Only admins can change payout settings." };
  const ms = String(fd.get("fee_router_multisig") ?? "").trim();
  const platform = String(fd.get("platform_treasury_address") ?? "").trim();
  if (!isSolanaAddress(ms) || !isSolanaAddress(platform)) return { error: "Both must be valid Solana addresses." };
  const get = await settings();
  const router = get("fee_router_address");
  if (!router) return { error: "Set the Fee Router address first." };
  if (vaultOf(new PublicKey(ms)).toBase58() !== router) return { error: "Vault #0 of this multisig isn't the published Fee Router address. Check both against the Squads app." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("platform_settings").upsert([
    { key: "fee_router_multisig", value: ms, updated_by: user.id, updated_at: now },
    { key: "platform_treasury_address", value: platform, updated_by: user.id, updated_at: now },
  ]);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { message: "Saved. The multisig derives the published Fee Router vault." };
}

export async function clearPayoutPause(_prev: SettingState): Promise<SettingState> {
  const user = await requireStaff();
  if (!user.roles.includes("admin")) return { error: "Only admins can resume payouts." };
  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").delete().eq("key", "payouts_paused");
  if (error) return { error: error.message };
  revalidatePath("/admin/payouts");
  return { message: "Payouts resumed. The next indexer run will pause again if the ledger still doesn't reconcile." };
}

export async function preparePayoutProposal(memberWallet: string, payoutIds: string[]): Promise<R<{ txBase64: string; ticket: string; transactionIndex: string; summary: ReturnType<typeof summarizeTransaction>; totalLamports: string }>> {
  try {
    await requireStaff();
    const get = await settings();
    if (get("payouts_paused")) throw new Error(`Payouts are paused: ${get("payouts_paused")}`);
    const msPda = get("fee_router_multisig");
    if (!msPda) throw new Error("An admin must set the Fee Router multisig in Platform settings.");
    const ids = [...new Set(payoutIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!ids.length) throw new Error("Select at least one payout.");
    const supabase = await createClient();
    const { data: rows } = await supabase.from("payouts").select("id, status, recipient_address, amount_raw").in("id", ids);
    if (!rows || rows.length !== ids.length || rows.some((r) => r.status !== "pending")) throw new Error("Every selected payout must be pending.");
    const built = await buildPayoutProposal({
      member: new PublicKey(memberWallet), multisigPda: new PublicKey(msPda),
      transfers: rows.map((r) => ({ to: new PublicKey(r.recipient_address), lamports: BigInt(r.amount_raw) })),
      memo: `Startit payouts ${ids.length}`,
    });
    const summary = summarizeTransaction(built.tx);
    return { ok: true, txBase64: Buffer.from(built.tx.serialize()).toString("base64"), ticket: proposalTicket(summary.messageSha256, ids, built.transactionIndex),
      transactionIndex: built.transactionIndex.toString(), summary, totalLamports: built.totalLamports.toString() };
  } catch (e) { return fail(e); }
}

export async function submitPayoutProposal(payoutIds: string[], transactionIndex: string, ticket: string, signedBase64: string): Promise<R<{ signature: string }>> {
  try {
    const staff = await requireStaff();
    const tx = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    const s = summarizeTransaction(tx);
    if (proposalTicket(s.messageSha256, payoutIds, BigInt(transactionIndex)) !== ticket) throw new Error("This isn't the proposal that was built for these payouts.");
    const allowed = new Set([SQUADS_PROGRAM.toBase58(), ComputeBudgetProgram.programId.toBase58()]);
    if (s.programs.some((p) => !allowed.has(p))) throw new Error("Unexpected program in the proposal transaction.");
    const conn = connection();
    const signature = await conn.sendRawTransaction(tx.serialize());
    const latest = await conn.getLatestBlockhash("confirmed");
    const conf = await conn.confirmTransaction({ signature, ...latest }, "confirmed");
    if (conf.value.err) throw new Error(`Proposal transaction failed: ${JSON.stringify(conf.value.err)}`);

    const supabase = await createClient();
    const { error } = await supabase.from("payouts").update({
      status: "submitted", squads_transaction_index: Number(transactionIndex), proposal_signature: signature,
      proposed_by: staff.id, proposed_at: new Date().toISOString(),
    }).in("id", payoutIds).eq("status", "pending");
    if (error) throw new Error(`Proposal ${signature} created but payouts weren't updated: ${error.message}`);
    revalidatePath("/admin/payouts");
    return { ok: true, signature };
  } catch (e) { return fail(e); }
}

