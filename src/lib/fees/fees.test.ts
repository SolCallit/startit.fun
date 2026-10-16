import { describe, expect, it } from "vitest";
import { DEFAULT_SPLIT, SELF_LAUNCH_SPLIT } from "@/lib/domain/fees";
import { planPayouts, reconcile } from "./planner";
import { classify, type TxLite } from "./classify";

const W = { platform: "P", founder: "F", launcher: "L", community: "C" };

describe("planPayouts", () => {
  it("splits a claim 50/30/5/15 and sums exactly", () => {
    const rows = planPayouts(BigInt(1_000_000_003), DEFAULT_SPLIT, W);
    expect(rows.map((r) => r.recipient)).toEqual(["community", "founder", "launcher", "platform"]);
    expect(rows.reduce((a, r) => a + r.amountRaw, BigInt(0))).toBe(BigInt(1_000_000_003));
  });
  it("skips the launcher on self-launch", () => {
    expect(planPayouts(BigInt(1000), SELF_LAUNCH_SPLIT, { ...W, launcher: null }).map((r) => r.recipient)).toEqual(["community", "founder", "platform"]);
  });
  it("refuses a launcher share with no launcher wallet", () => {
    expect(() => planPayouts(BigInt(1000), DEFAULT_SPLIT, { ...W, launcher: null })).toThrow();
  });
  it("skips zero rows on tiny claims", () => {
    expect(planPayouts(BigInt(1), DEFAULT_SPLIT, W)).toEqual([{ recipient: "community", recipientAddress: "C", amountRaw: BigInt(1) }]);
  });
});

describe("reconcile", () => {
  it("passes a clean ledger", () => expect(reconcile({ collectedRaw: BigInt(100), plannedRaw: BigInt(100), confirmedRaw: BigInt(60), failedCount: 0 }).ok).toBe(true));
  it("flags over-planning, over-payment and failures", () => {
    expect(reconcile({ collectedRaw: BigInt(100), plannedRaw: BigInt(101), confirmedRaw: BigInt(0), failedCount: 0 }).ok).toBe(false);
    expect(reconcile({ collectedRaw: BigInt(100), plannedRaw: BigInt(100), confirmedRaw: BigInt(101), failedCount: 0 }).ok).toBe(false);
    expect(reconcile({ collectedRaw: BigInt(100), plannedRaw: BigInt(100), confirmedRaw: BigInt(0), failedCount: 1 }).ok).toBe(false);
  });
});

describe("classify", () => {
  const ctx = { vault: "V", launchlab: "LL", cpmm: "CP", cpmmLock: "LK", launches: [{ launchId: "a", mint: "MA", pools: ["PA"] }, { launchId: "b", mint: "MB", pools: ["PB"] }] };
  const base: TxLite = { signature: "s", slot: 1, failed: false, accountKeys: ["V", "PA"], signers: ["X"], programIds: ["LL"], vaultLamportDelta: BigInt(500), vaultTransfersOut: [] };

  it("attributes a LaunchLab platform-fee claim to its launch", () => {
    expect(classify(base, ctx)).toEqual({ kind: "claim", launchId: "a", source: "platform_fee", amountRaw: BigInt(500) });
  });
  it("classifies LP Fee Key and CPMM creator claims", () => {
    expect(classify({ ...base, programIds: ["LK", "CP"] }, ctx)).toMatchObject({ source: "lp_fee_key" });
    expect(classify({ ...base, programIds: ["CP"] }, ctx)).toMatchObject({ source: "cpmm_creator_fee" });
  });
  it("ignores failed, unlinked, ambiguous and unknown-program inflows", () => {
    expect(classify({ ...base, failed: true }, ctx).kind).toBe("ignore");
    expect(classify({ ...base, accountKeys: ["V"] }, ctx).kind).toBe("ignore");
    expect(classify({ ...base, accountKeys: ["V", "PA", "MB"] }, ctx).kind).toBe("ignore");
    expect(classify({ ...base, programIds: ["Evil"] }, ctx).kind).toBe("ignore");
  });
  it("treats vault outflows as payouts, never as claims", () => {
    expect(classify({ ...base, vaultTransfersOut: [{ to: "C", lamports: BigInt(5) }] }, ctx)).toEqual({ kind: "payouts", transfers: [{ to: "C", lamports: BigInt(5) }] });
  });
});
