/**
 * Classifies a transaction touching the Fee Router vault.
 * Inflows are fee claims (attributed to a launch by pool or mint address); outflows are payouts.
 * Works on a minimal shape so it can be tested without RPC.
 */
export type TxLite = {
  signature: string;
  slot: number;
  failed: boolean;
  accountKeys: string[];
  signers: string[];
  programIds: string[];
  /** lamport balance change of the vault (post - pre) */
  vaultLamportDelta: bigint;
  /** native SOL transfers out of the vault in this tx: [recipient, lamports] */
  vaultTransfersOut: { to: string; lamports: bigint }[];
};

export type LaunchRef = { launchId: string; mint: string; pools: string[] };

export type Classified =
  | { kind: "ignore"; reason: string }
  | { kind: "claim"; launchId: string; source: "platform_fee" | "lp_fee_key" | "cpmm_creator_fee"; amountRaw: bigint }
  | { kind: "payouts"; transfers: { to: string; lamports: bigint }[] };

export function classify(tx: TxLite, ctx: { vault: string; launches: LaunchRef[]; launchlab: string; cpmm: string; cpmmLock: string }): Classified {
  if (tx.failed) return { kind: "ignore", reason: "failed transaction" };
  if (tx.vaultTransfersOut.length) return { kind: "payouts", transfers: tx.vaultTransfersOut };
  if (tx.vaultLamportDelta <= BigInt(0)) return { kind: "ignore", reason: "no inflow to the vault" };

  const keys = new Set(tx.accountKeys);
  const matches = ctx.launches.filter((l) => keys.has(l.mint) || l.pools.some((p) => keys.has(p)));
  if (matches.length !== 1) {
    return { kind: "ignore", reason: matches.length ? "inflow touches several launches; needs manual attribution" : "inflow not linked to any launch" };
  }
  const programs = new Set(tx.programIds);
  const source = programs.has(ctx.cpmmLock) ? "lp_fee_key" : programs.has(ctx.cpmm) ? "cpmm_creator_fee" : programs.has(ctx.launchlab) ? "platform_fee" : null;
  if (!source) return { kind: "ignore", reason: "inflow from an unrecognised program" };
  return { kind: "claim", launchId: matches[0]!.launchId, source, amountRaw: tx.vaultLamportDelta };
}
