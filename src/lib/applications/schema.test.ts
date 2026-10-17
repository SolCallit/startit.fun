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

describe("parseStep", () => {
  it("strict mode requires all fields", () => {
    const r = parseStep(1, { applicant_name: "", contact_email: "", applicant_role: "", applicant_is_founder: "" }, true);
    expect(r.ok).toBe(false);
  });
  it("draft mode ignores blank fields but flags bad ones", () => {
    expect(parseStep(1, { applicant_name: "", contact_email: "", applicant_role: "", applicant_is_founder: "" }, false).ok).toBe(true);
    const r = parseStep(1, { applicant_name: "", contact_email: "nope", applicant_role: "", applicant_is_founder: "" }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["contact_email"]);
  });
  it("accepts the scout default and the self-launch default without a reason", () => {
    const scout = { applicant_is_founder: "no", proposed_platform_bps: "1500", proposed_founder_bps: "3000", proposed_launcher_bps: "500", proposed_community_bps: "5000", split_reason: "" };
    const self = { applicant_is_founder: "yes", proposed_platform_bps: "2000", proposed_founder_bps: "3000", proposed_launcher_bps: "0", proposed_community_bps: "5000", split_reason: "" };
    expect(parseStep(5, scout, true).ok).toBe(true);
    expect(parseStep(5, self, true).ok).toBe(true);
  });
  it("custom fee split needs a reason and must total 100%", () => {
    const base = { applicant_is_founder: "no", proposed_platform_bps: "1000", proposed_founder_bps: "3500", proposed_launcher_bps: "500", proposed_community_bps: "5000" };
    expect(parseStep(5, { ...base, split_reason: "" }, true).ok).toBe(false);
    expect(parseStep(5, { ...base, split_reason: "Founder is funding liquidity" }, true).ok).toBe(true);
    expect(parseStep(5, { ...base, proposed_community_bps: "4000", split_reason: "x" }, true).ok).toBe(false);
  });
  it("a founder launching their own project can't take the launcher share", () => {
    const r = parseStep(5, { applicant_is_founder: "yes", proposed_platform_bps: "1500", proposed_founder_bps: "3000", proposed_launcher_bps: "500", proposed_community_bps: "5000", split_reason: "" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.proposed_launcher_bps).toBeDefined();
  });
  it("normalises ticker to upper case", () => {
    const r = parseStep(4, { token_name: "Forge", ticker: "forge", token_concept: "c", community_plan: "p", milestones: "" }, true);
    expect(r.ok && r.data?.ticker).toBe("FORGE");
  });
});

describe("pairing (step 4)", () => {
  const base = { token_name: "Forge", ticker: "FORGE", token_concept: "c", community_plan: "p", milestones: "" };
  it("is optional", () => {
    expect(parseStep(4, { ...base, pair_kind: "" }, true).ok).toBe(true);
  });
  it("needs name, relationship and reason once a kind is chosen", () => {
    const r = parseStep(4, { ...base, pair_kind: "person" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["pair_name", "pair_relationship", "pair_reason"]));
  });
  it("needs a mint for token pairings", () => {
    const r = parseStep(4, { ...base, pair_kind: "token", pair_name: "Jupiter", pair_relationship: "inspired_by", pair_reason: "We build on Jupiter." }, true);
    expect(!r.ok && r.errors.pair_mint).toBeTruthy();
    const ok = parseStep(4, { ...base, pair_kind: "token", pair_name: "Jupiter", pair_relationship: "inspired_by", pair_reason: "We build on Jupiter.", pair_mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }, true);
    expect(ok.ok).toBe(true);
  });
  it("rejects non-https pair links", () => {
    const r = parseStep(4, { ...base, pair_kind: "project", pair_name: "HF", pair_relationship: "inspired_by", pair_reason: "x", pair_url: "http://hf.co" }, true);
    expect(!r.ok && r.errors.pair_url).toBeTruthy();
  });
});
