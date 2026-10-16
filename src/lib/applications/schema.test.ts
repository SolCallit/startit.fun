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
    const r = parseStep(1, { applicant_name: "", contact_email: "", applicant_role: "" }, true);
    expect(r.ok).toBe(false);
  });
  it("draft mode ignores blank fields but flags bad ones", () => {
    expect(parseStep(1, { applicant_name: "", contact_email: "", applicant_role: "" }, false).ok).toBe(true);
    const r = parseStep(1, { applicant_name: "", contact_email: "nope", applicant_role: "" }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["contact_email"]);
  });
  it("custom fee split needs a reason and must total 100%", () => {
    const base = { proposed_platform_bps: "1500", proposed_founder_bps: "3500", proposed_community_bps: "5000" };
    expect(parseStep(5, { ...base, split_reason: "" }, true).ok).toBe(false);
    expect(parseStep(5, { ...base, split_reason: "Founder is funding liquidity" }, true).ok).toBe(true);
    expect(parseStep(5, { ...base, proposed_community_bps: "4000", split_reason: "x" }, true).ok).toBe(false);
  });
  it("normalises ticker to upper case", () => {
    const r = parseStep(4, { token_name: "Forge", ticker: "forge", token_concept: "c", community_plan: "p", milestones: "" }, true);
    expect(r.ok && r.data?.ticker).toBe("FORGE");
  });
});
