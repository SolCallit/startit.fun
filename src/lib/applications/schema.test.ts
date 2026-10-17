import { describe, expect, it } from "vitest";
import { httpsUrl, parseStep } from "./schema";

describe("httpsUrl", () => {
  it("rejects http, javascript: and credentials", () => {
    const s = httpsUrl("Link");
    expect(s.safeParse("http://example.com").success).toBe(false);
    expect(s.safeParse("javascript:alert(1)").success).toBe(false);
    expect(s.safeParse("https://user:pw@example.com").success).toBe(false);
    expect(s.safeParse("https://example.com/a").success).toBe(true);
  });
  it("pins hostnames without being fooled by look-alikes", () => {
    const gh = httpsUrl("GitHub", ["github.com"]);
    expect(gh.safeParse("https://github.com/acme").success).toBe(true);
    expect(gh.safeParse("https://evilgithub.com/acme").success).toBe(false);
    expect(gh.safeParse("https://github.com.evil.io/acme").success).toBe(false);
  });
});

const coin = { project_name: "Forge", ticker: "forge", project_summary: "Eval harness", website: "", x: "https://x.com/forge", github: "", telegram: "", discord: "" };

describe("parseStep", () => {
  it("step 1 needs name, ticker, description and one official link", () => {
    expect(parseStep(1, coin, true).ok).toBe(true);
    const r = parseStep(1, { ...coin, x: "" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.website).toMatch(/at least/);
    expect(parseStep(1, { ...coin, project_name: "" }, true).ok).toBe(false);
  });
  it("uppercases the ticker and rejects bad ones", () => {
    const r = parseStep(1, coin, true);
    if (r.ok && r.data) expect((r.data as { ticker: string }).ticker).toBe("FORGE");
    expect(parseStep(1, { ...coin, ticker: "F" }, true).ok).toBe(false);
  });
  it("pins social links to their hosts", () => {
    expect(parseStep(1, { ...coin, telegram: "https://evil.com/forge" }, true).ok).toBe(false);
    expect(parseStep(1, { ...coin, discord: "https://discord.gg/forge" }, true).ok).toBe(true);
  });
  it("draft mode ignores blank fields but flags bad ones", () => {
    const blank = { project_name: "", ticker: "", project_summary: "", website: "", x: "", github: "", telegram: "", discord: "" };
    expect(parseStep(1, blank, false).ok).toBe(true);
    const r = parseStep(1, { ...blank, github: "https://gitlab.com/x" }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["github"]);
  });
  it("accepts the backer default and the team default without a reason", () => {
    const backer = { applicant_is_founder: "no", proposed_platform_bps: "1500", proposed_founder_bps: "3000", proposed_launcher_bps: "500", proposed_community_bps: "5000", split_reason: "" };
    const team = { applicant_is_founder: "yes", proposed_platform_bps: "2000", proposed_founder_bps: "3000", proposed_launcher_bps: "0", proposed_community_bps: "5000", split_reason: "" };
    expect(parseStep(2, backer, true).ok).toBe(true);
    expect(parseStep(2, team, true).ok).toBe(true);
  });
  it("custom fee split needs a reason and must total 100%", () => {
    const base = { applicant_is_founder: "no", proposed_platform_bps: "1000", proposed_founder_bps: "3500", proposed_launcher_bps: "500", proposed_community_bps: "5000" };
    expect(parseStep(2, { ...base, split_reason: "" }, true).ok).toBe(false);
    expect(parseStep(2, { ...base, split_reason: "Builder is funding liquidity" }, true).ok).toBe(true);
    expect(parseStep(2, { ...base, proposed_community_bps: "4000", split_reason: "x" }, true).ok).toBe(false);
  });
  it("someone on the team can't take the launcher share", () => {
    const r = parseStep(2, { applicant_is_founder: "yes", proposed_platform_bps: "1500", proposed_founder_bps: "3000", proposed_launcher_bps: "500", proposed_community_bps: "5000", split_reason: "" }, true);
    expect(r.ok).toBe(false);
  });
  it("starter's buy is optional, capped, and submitting needs the terms", () => {
    expect(parseStep(3, { starter_buy_amount: "", ack_terms: "on" }, true).ok).toBe(true);
    expect(parseStep(3, { starter_buy_amount: "1.5", ack_terms: "on" }, true).ok).toBe(true);
    expect(parseStep(3, { starter_buy_amount: "26", ack_terms: "on" }, true).ok).toBe(false);
    expect(parseStep(3, { starter_buy_amount: "1", ack_terms: "" }, true).ok).toBe(false);
  });
  it("an inspired-by link needs a name, relationship and reason", () => {
    expect(parseStep(1, { ...coin, pair_kind: "person" }, true).ok).toBe(false);
    expect(parseStep(1, { ...coin, pair_kind: "token", pair_name: "Jupiter", pair_relationship: "inspired_by", pair_reason: "We build on it." }, true).ok).toBe(false);
    expect(parseStep(1, { ...coin, pair_kind: "token", pair_name: "Jupiter", pair_relationship: "inspired_by", pair_reason: "We build on it.", pair_mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }, true).ok).toBe(true);
  });
});
