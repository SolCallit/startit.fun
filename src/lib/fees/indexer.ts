import "server-only";
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { createServiceClient } from "@/lib/supabase/service";
import { connection, LAUNCHLAB_PROGRAM } from "@/lib/launch/launchlab";
import { classify, type LaunchRef, type TxLite } from "./classify";
import { planPayouts, reconcile } from "./planner";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const log = (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), svc: "fee-indexer", msg, ...extra }));

export function toTxLite(signature: string, tx: ParsedTransactionWithMeta, vault: string): TxLite {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const vi = keys.indexOf(vault);
  const delta = vi >= 0 && tx.meta ? BigInt(tx.meta.postBalances[vi]!) - BigInt(tx.meta.preBalances[vi]!) : BigInt(0);
  const all = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions)];
  const transfersOut: { to: string; lamports: bigint }[] = [];
  for (const ix of all) {
    if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer" && ix.parsed.info?.source === vault) {
      transfersOut.push({ to: String(ix.parsed.info.destination), lamports: BigInt(ix.parsed.info.lamports) });
    }
  }
  return {
    signature, slot: tx.slot, failed: !!tx.meta?.err, accountKeys: keys,
    signers: tx.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey.toBase58()),
    programIds: [...new Set(all.map((ix) => ix.programId.toBase58()))],
    vaultLamportDelta: delta, vaultTransfersOut: transfersOut,
  };
}

/**
 * Reads new Fee Router transactions from the chain, records fee claims, plans payouts by each launch's
 * approved split, confirms executed payouts, and pauses payouts if anything doesn't reconcile.
 * Writes use the service role: this runs from cron with no user, and only records what the chain shows.
 */
export async function runFeeIndexer() {
  const db = createServiceClient();
  const { data: settings } = await db.from("platform_settings").select("key, value");
  const get = (k: string) => settings?.find((s) => s.key === k)?.value ?? null;
  const vault = get("fee_router_address");
  if (!vault) return { skipped: "Fee Router not configured" };
  const platformWallet = get("platform_treasury_address");
  const cursor = get("fee_indexer_cursor");

  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(new PublicKey(vault), cursor ? { until: cursor, limit: 200 } : { limit: 200 }, "confirmed");
  const ordered = sigs.reverse(); // oldest first

  const { data: launches } = await db.from("launches")
    .select("id, mint_address, launchlab_pool_address, cpmm_pool_address, founder_wallet, launcher_wallet, fee_config_id, application_id, applications(status)")
    .eq("status", "finalized");
  const { data: treasuryRows } = await db.from("treasuries").select("application_id, address")
    .in("application_id", (launches ?? []).map((l) => l.application_id));
  const refs: LaunchRef[] = (launches ?? []).map((l) => ({ launchId: l.id, mint: l.mint_address, pools: [l.launchlab_pool_address, l.cpmm_pool_address].filter(Boolean) as string[] }));
  const ctx = { vault, launches: refs, launchlab: LAUNCHLAB_PROGRAM.toBase58(), cpmm: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58(), cpmmLock: DEVNET_PROGRAM_ID.LOCK_CPMM_PROGRAM?.toBase58?.() ?? "" };

  let claims = 0, planned = 0, confirmed = 0;
  const skipped: string[] = [];
  for (let i = 0; i < ordered.length; i += 25) {
    const batch = ordered.slice(i, i + 25);
    const txs = await conn.getParsedTransactions(batch.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    for (let j = 0; j < batch.length; j++) {
      const tx = txs[j];
      if (!tx) continue;
      const c = classify(toTxLite(batch[j]!.signature, tx, vault), ctx);
      if (c.kind === "ignore") { if (c.reason !== "no inflow to the vault") skipped.push(`${batch[j]!.signature}: ${c.reason}`); continue; }

      if (c.kind === "claim") {
        const { data: claim, error } = await db.from("fee_claims").upsert(
          { launch_id: c.launchId, source: c.source, amount_raw: c.amountRaw.toString(), quote_mint: SOL_MINT, tx_signature: batch[j]!.signature, slot: tx.slot },
          { onConflict: "tx_signature,launch_id,source", ignoreDuplicates: true },
        ).select("id").maybeSingle();
        if (error) throw new Error(`fee_claims: ${error.message}`);
        if (!claim) continue; // already recorded
        claims++;

        const l = launches!.find((x) => x.id === c.launchId)!;
        const appStatus = (l.applications as unknown as { status: string } | null)?.status;
        if (appStatus === "suspended") { skipped.push(`${batch[j]!.signature}: launch suspended — payouts held`); continue; }
        if (!platformWallet) { skipped.push(`${batch[j]!.signature}: platform_treasury_address not set — payouts not planned`); continue; }
        const { data: fc } = await db.from("fee_configs").select("platform_bps, founder_bps, launcher_bps, community_bps").eq("id", l.fee_config_id).single();
        const treasury = treasuryRows?.find((t) => t.application_id === l.application_id)?.address;
        if (!fc || !treasury) { skipped.push(`${batch[j]!.signature}: missing split or treasury`); continue; }
        const rows = planPayouts(c.amountRaw, { platformBps: fc.platform_bps, founderBps: fc.founder_bps, launcherBps: fc.launcher_bps, communityBps: fc.community_bps },
          { platform: platformWallet, founder: l.founder_wallet, launcher: l.launcher_wallet, community: treasury });
        const ins = await db.from("payouts").insert(rows.map((r) => ({
          launch_id: c.launchId, source_claim_id: claim.id, recipient: r.recipient, recipient_address: r.recipientAddress, amount_raw: r.amountRaw.toString(),
        })));
        if (ins.error) throw new Error(`payouts: ${ins.error.message}`);
        planned += rows.length;
      }

      if (c.kind === "payouts") {
        for (const t of c.transfers) {
          const { data: match } = await db.from("payouts").select("id").eq("status", "submitted").eq("recipient_address", t.to)
            .eq("amount_raw", t.lamports.toString()).order("created_at").limit(1).maybeSingle();
          if (!match) { skipped.push(`${batch[j]!.signature}: transfer of ${t.lamports} to ${t.to} matches no submitted payout`); continue; }
          const up = await db.from("payouts").update({ status: "confirmed", tx_signature: batch[j]!.signature, confirmed_at: new Date().toISOString() }).eq("id", match.id);
          if (up.error) throw new Error(`confirm payout: ${up.error.message}`);
          confirmed++;
        }
      }
    }
    // Advance the cursor after each fully-processed batch.
    await db.from("platform_settings").upsert({ key: "fee_indexer_cursor", value: batch[batch.length - 1]!.signature, updated_at: new Date().toISOString() });
  }

  // Reconcile every launch; any breach pauses payouts platform-wide until a person clears it.
  const { data: ledger } = await db.from("fee_ledger").select("*");
  const issues = (ledger ?? []).flatMap((r) => reconcile({
    collectedRaw: BigInt(r.collected_raw), plannedRaw: BigInt(r.planned_raw), confirmedRaw: BigInt(r.confirmed_raw), failedCount: Number(r.failed_count),
  }).issues.map((i) => `${r.public_ref}: ${i}`));
  if (issues.length) await db.from("platform_settings").upsert({ key: "payouts_paused", value: issues.join(" | ").slice(0, 2000), updated_at: new Date().toISOString() });
  // Unrecognised outflows from the vault are themselves a reconciliation failure.
  const unmatched = skipped.filter((s) => s.includes("matches no submitted payout"));
  if (unmatched.length) await db.from("platform_settings").upsert({ key: "payouts_paused", value: `Unmatched outflow: ${unmatched[0]}`, updated_at: new Date().toISOString() });

  log("indexer run", { scanned: ordered.length, claims, planned, confirmed, skipped: skipped.length, issues: issues.length });
  return { scanned: ordered.length, claims, planned, confirmed, skipped, issues };
}
