/** Fee allocation math. Basis points of *distributable fees actually collected*. */
export const BPS_TOTAL = 10_000;

export type FeeSplit = { platformBps: number; founderBps: number; communityBps: number };

export const DEFAULT_SPLIT: FeeSplit = { platformBps: 2000, founderBps: 3000, communityBps: 5000 };

export function validateSplit(split: FeeSplit): { ok: true } | { ok: false; error: string } {
  const parts = [split.platformBps, split.founderBps, split.communityBps];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > BPS_TOTAL)) {
    return { ok: false, error: "Each share must be a whole number of basis points between 0 and 10,000." };
  }
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== BPS_TOTAL) {
    return { ok: false, error: `Shares must add up to exactly 100%. They currently add up to ${total / 100}%.` };
  }
  return { ok: true };
}

export function isDefaultSplit(split: FeeSplit): boolean {
  return (
    split.platformBps === DEFAULT_SPLIT.platformBps &&
    split.founderBps === DEFAULT_SPLIT.founderBps &&
    split.communityBps === DEFAULT_SPLIT.communityBps
  );
}

/**
 * Splits an on-chain amount (smallest unit, e.g. lamports) by basis points using integer math.
 * Rounding dust goes to the community share, so the three parts always sum to the input exactly.
 */
export function allocate(amountRaw: bigint, split: FeeSplit): { platform: bigint; founder: bigint; community: bigint } {
  const check = validateSplit(split);
  if (!check.ok) throw new Error(check.error);
  if (amountRaw < BigInt(0)) throw new Error("Amount cannot be negative.");
  const total = BigInt(BPS_TOTAL);
  const platform = (amountRaw * BigInt(split.platformBps)) / total;
  const founder = (amountRaw * BigInt(split.founderBps)) / total;
  const community = amountRaw - platform - founder;
  return { platform, founder, community };
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
