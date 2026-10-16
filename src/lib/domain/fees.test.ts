import { describe, expect, it } from "vitest";
import { allocate, DEFAULT_SPLIT, isDefaultSplit, validateSplit } from "./fees";

describe("validateSplit", () => {
  it("accepts the default 20/30/50", () => {
    expect(validateSplit(DEFAULT_SPLIT)).toEqual({ ok: true });
  });
  it("rejects splits that do not total 100%", () => {
    const r = validateSplit({ platformBps: 2000, founderBps: 3000, communityBps: 4000 });
    expect(r.ok).toBe(false);
  });
  it("rejects negative and fractional shares", () => {
    expect(validateSplit({ platformBps: -1, founderBps: 5001, communityBps: 5000 }).ok).toBe(false);
    expect(validateSplit({ platformBps: 2000.5, founderBps: 2999.5, communityBps: 5000 }).ok).toBe(false);
  });
});

describe("allocate", () => {
  it("splits exactly with no lost lamports", () => {
    const amount = BigInt(1_000_000_007);
    const r = allocate(amount, DEFAULT_SPLIT);
    expect(r.platform + r.founder + r.community).toBe(amount);
    expect(r.platform).toBe(BigInt(200_000_001));
    expect(r.founder).toBe(BigInt(300_000_002));
    expect(r.community).toBe(BigInt(500_000_004));
  });
  it("handles zero", () => {
    expect(allocate(BigInt(0), DEFAULT_SPLIT)).toEqual({ platform: BigInt(0), founder: BigInt(0), community: BigInt(0) });
  });
  it("refuses an invalid split", () => {
    expect(() => allocate(BigInt(100), { platformBps: 1, founderBps: 1, communityBps: 1 })).toThrow();
  });
  it("detects the default split", () => {
    expect(isDefaultSplit(DEFAULT_SPLIT)).toBe(true);
    expect(isDefaultSplit({ platformBps: 1500, founderBps: 3500, communityBps: 5000 })).toBe(false);
  });
});
