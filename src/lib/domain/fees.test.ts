import { describe, expect, it } from "vitest";
import { allocate, DEFAULT_SPLIT, defaultSplitFor, isDefaultSplit, SELF_LAUNCH_SPLIT, validateSplit } from "./fees";

describe("validateSplit", () => {
  it("accepts both defaults", () => {
    expect(validateSplit(DEFAULT_SPLIT)).toEqual({ ok: true });
    expect(validateSplit(SELF_LAUNCH_SPLIT)).toEqual({ ok: true });
  });
  it("rejects splits that do not total 100%", () => {
    expect(validateSplit({ platformBps: 1500, founderBps: 3000, launcherBps: 500, communityBps: 4000 }).ok).toBe(false);
  });
  it("rejects negative and fractional shares", () => {
    expect(validateSplit({ platformBps: -1, founderBps: 3001, launcherBps: 1000, communityBps: 6000 }).ok).toBe(false);
    expect(validateSplit({ platformBps: 1500.5, founderBps: 2999.5, launcherBps: 500, communityBps: 5000 }).ok).toBe(false);
  });
});

describe("defaults", () => {
  it("self-launch folds the launcher share into the platform", () => {
    expect(defaultSplitFor(true)).toEqual({ platformBps: 2000, founderBps: 3000, launcherBps: 0, communityBps: 5000 });
    expect(defaultSplitFor(false)).toEqual({ platformBps: 1500, founderBps: 3000, launcherBps: 500, communityBps: 5000 });
  });
  it("recognises both defaults and nothing else", () => {
    expect(isDefaultSplit(DEFAULT_SPLIT)).toBe(true);
    expect(isDefaultSplit(SELF_LAUNCH_SPLIT)).toBe(true);
    expect(isDefaultSplit({ platformBps: 1000, founderBps: 3500, launcherBps: 500, communityBps: 5000 })).toBe(false);
  });
});

describe("allocate", () => {
  it("splits exactly with no lost lamports", () => {
    const amount = BigInt(1_000_000_007);
    const r = allocate(amount, DEFAULT_SPLIT);
    expect(r.platform + r.founder + r.launcher + r.community).toBe(amount);
    expect(r.platform).toBe(BigInt(150_000_001));
    expect(r.founder).toBe(BigInt(300_000_002));
    expect(r.launcher).toBe(BigInt(50_000_000));
    expect(r.community).toBe(BigInt(500_000_004));
  });
  it("pays no launcher on self-launch", () => {
    expect(allocate(BigInt(1000), SELF_LAUNCH_SPLIT).launcher).toBe(BigInt(0));
  });
  it("handles zero and refuses an invalid split", () => {
    expect(allocate(BigInt(0), DEFAULT_SPLIT).community).toBe(BigInt(0));
    expect(() => allocate(BigInt(100), { platformBps: 1, founderBps: 1, launcherBps: 1, communityBps: 1 })).toThrow();
  });
});
