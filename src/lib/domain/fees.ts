/** Fee allocation math. Basis points of *distributable fees actually collected*. */
export const BPS_TOTAL = 10_000;

export type FeeSplit = { platformBps: number; founderBps: number; launcherBps: number; communityBps: number };

/** Someone other than the founder (a scout) found the startup and submitted it. */
export const DEFAULT_SPLIT: FeeSplit = { platformBps: 1500, founderBps: 3000, launcherBps: 500, communityBps: 5000 };
/** The founder launched their own project: there's no separate starter, so that 5% stays with the platform. */
export const SELF_LAUNCH_SPLIT: FeeSplit = { platformBps: 2000, founderBps: 3000, launcherBps: 0, communityBps: 5000 };

export const defaultSplitFor = (applicantIsFounder: boolean | null | undefined) =>
  applicantIsFounder ? SELF_LAUNCH_SPLIT : DEFAULT_SPLIT;

const parts = (s: FeeSplit) => [s.platformBps, s.founderBps, s.launcherBps, s.communityBps];

export function validateSplit(split: FeeSplit): { ok: true } | { ok: false; error: string } {
  if (parts(split).some((p) => !Number.isInteger(p) || p < 0 || p > BPS_TOTAL)) {
    return { ok: false, error: "Each share must be a whole number of basis points between 0 and 10,000." };
  }
  const total = parts(split).reduce((a, b) => a + b, 0);
  if (total !== BPS_TOTAL) {
    return { ok: false, error: `Shares must add up to exactly 100%. They currently add up to ${total / 100}%.` };
  }
  return { ok: true };
}

const same = (a: FeeSplit, b: FeeSplit) => parts(a).every((v, i) => v === parts(b)[i]);
export function isDefaultSplit(split: FeeSplit): boolean {
  return same(split, DEFAULT_SPLIT) || same(split, SELF_LAUNCH_SPLIT);
}

/**
 * Splits an on-chain amount (smallest unit, e.g. lamports) by basis points using integer math.
 * Rounding dust goes to the community share, so the parts always sum to the input exactly.
 */
export function allocate(amountRaw: bigint, split: FeeSplit): { platform: bigint; founder: bigint; launcher: bigint; community: bigint } {
  const check = validateSplit(split);
  if (!check.ok) throw new Error(check.error);
  if (amountRaw < BigInt(0)) throw new Error("Amount cannot be negative.");
  const total = BigInt(BPS_TOTAL);
  const platform = (amountRaw * BigInt(split.platformBps)) / total;
  const founder = (amountRaw * BigInt(split.founderBps)) / total;
  const launcher = (amountRaw * BigInt(split.launcherBps)) / total;
  return { platform, founder, launcher, community: amountRaw - platform - founder - launcher };
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
