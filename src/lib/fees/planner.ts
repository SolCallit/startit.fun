import { allocate, type FeeSplit } from "@/lib/domain/fees";

export type Recipient = "platform" | "founder" | "launcher" | "community";
export type PlannedPayout = { recipient: Recipient; recipientAddress: string; amountRaw: bigint };

/**
 * Turns one confirmed fee claim into payouts by the launch's approved split.
 * Zero-amount rows are skipped. Amounts always sum to the claim exactly (dust goes to the community).
 */
export function planPayouts(
  claimAmountRaw: bigint,
  split: FeeSplit,
  wallets: { platform: string; founder: string; launcher: string | null; community: string },
): PlannedPayout[] {
  if (split.launcherBps > 0 && !wallets.launcher) throw new Error("Launcher share is set but no launcher wallet is configured.");
  const a = allocate(claimAmountRaw, split);
  const rows: PlannedPayout[] = [
    { recipient: "community", recipientAddress: wallets.community, amountRaw: a.community },
    { recipient: "founder", recipientAddress: wallets.founder, amountRaw: a.founder },
    { recipient: "launcher", recipientAddress: wallets.launcher ?? "", amountRaw: a.launcher },
    { recipient: "platform", recipientAddress: wallets.platform, amountRaw: a.platform },
  ];
  return rows.filter((r) => r.amountRaw > BigInt(0));
}

export type LaunchLedger = { collectedRaw: bigint; plannedRaw: bigint; confirmedRaw: bigint; failedCount: number };

/** Reconciliation rules. Any breach pauses payouts until a person looks. */
export function reconcile(l: LaunchLedger): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (l.plannedRaw > l.collectedRaw) issues.push(`Planned payouts (${l.plannedRaw}) exceed fees collected (${l.collectedRaw}).`);
  if (l.confirmedRaw > l.plannedRaw) issues.push(`Confirmed payouts (${l.confirmedRaw}) exceed planned payouts (${l.plannedRaw}).`);
  if (l.failedCount > 0) issues.push(`${l.failedCount} payout(s) failed and need attention.`);
  return { ok: issues.length === 0, issues };
}
