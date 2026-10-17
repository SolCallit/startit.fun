import { describe, expect, it } from "vitest";
import { baseDomain, runChecks, xHandle, type WebsiteEvidence } from "./checks";
import { mergeReport, scrub, type ModelOutput } from "./report";
import type { GitHubEvidence } from "./fetchers/github";

const now = new Date("2026-10-16T12:00:00Z");
const site = (links: string[], over: Partial<Extract<WebsiteEvidence, { ok: true }>> = {}): WebsiteEvidence => ({
  ok: true, requestedUrl: "https://neuroforge.ai", url: "https://neuroforge.ai/", status: 200, fetchedAt: now.toISOString(),
  sha256: "a".repeat(64), title: "NeuroForge", text: "", links, ...over,
});
const repo = (over: Partial<Extract<GitHubEvidence, { kind: "repo" }>["repo"]> = {}): GitHubEvidence => ({
  kind: "repo", url: "https://github.com/neuroforge/forge", apiUrl: "https://api.github.com/repos/neuroforge/forge",
  fetchedAt: now.toISOString(), sha256: "b".repeat(64),
  repo: { full_name: "neuroforge/forge", owner_type: "Organization", description: null, homepage: "https://neuroforge.ai",
    created_at: "2025-01-01T00:00:00Z", pushed_at: "2026-10-10T00:00:00Z", stargazers_count: 120, forks_count: 4,
    open_issues_count: 3, archived: false, fork: false, license: "MIT", default_branch: "main", ...over },
  recentCommits: [], releases: [], contributors: [{ login: "ada", contributions: 40 }], readme: "",
});
const base = {
  websiteUrl: "https://neuroforge.ai", xUrl: "https://x.com/NeuroForge", githubUrl: "https://github.com/neuroforge/forge",
  contactEmail: "ada@neuroforge.ai", now,
};
const by = (fs: ReturnType<typeof runChecks>["findings"], claim: string) => fs.find((f) => f.claim.includes(claim));

describe("helpers", () => {
  it("baseDomain", () => {
    expect(baseDomain("www.app.neuroforge.ai")).toBe("neuroforge.ai");
    expect(baseDomain("shop.example.co.uk")).toBe("example.co.uk");
  });
  it("xHandle", () => {
    expect(xHandle("https://x.com/NeuroForge")).toBe("neuroforge");
    expect(xHandle("https://twitter.com/neuro_forge/status/1")).toBe("neuro_forge");
    expect(xHandle("https://evil.com/neuroforge")).toBeNull();
  });
});

describe("runChecks", () => {
  it("verifies a consistent project", () => {
    const { findings } = runChecks({ ...base, website: site(["https://github.com/neuroforge", "https://x.com/neuroforge"]), github: repo() });
    expect(by(findings, "online")?.status).toBe("VERIFIED");
    expect(by(findings, "links to the submitted GitHub")?.status).toBe("VERIFIED");
    expect(by(findings, "@neuroforge is official")?.status).toBe("VERIFIED");
    expect(by(findings, "points back")?.status).toBe("VERIFIED");
    expect(by(findings, "Contact email")?.status).toBe("VERIFIED");
    // Authorization is never auto-verified.
    expect(by(findings, "builder approved this launch")?.status).toBe("NEEDS_REVIEW");
  });

  it("flags a website pointing at different accounts (impersonation signal)", () => {
    const { findings } = runChecks({ ...base, website: site(["https://github.com/realforge", "https://x.com/realforge"]), github: repo() });
    expect(by(findings, "links to the submitted GitHub")?.status).toBe("FLAGGED");
    expect(by(findings, "is official")?.status).toBe("FLAGGED");
  });

  it("flags archived, forked and brand-new repos", () => {
    const { findings } = runChecks({ ...base, website: site([]), github: repo({ archived: true, fork: true, created_at: "2026-10-01T00:00:00Z" }) });
    expect(by(findings, "actively maintained")?.status).toBe("FLAGGED");
    expect(by(findings, "original work")?.status).toBe("NEEDS_REVIEW");
    expect(by(findings, "track record")?.status).toBe("NEEDS_REVIEW");
  });

  it("handles an unreachable site and missing repo", () => {
    const { findings } = runChecks({ ...base,
      website: { ok: false, requestedUrl: base.websiteUrl, fetchedAt: now.toISOString(), error: "ESSRF" },
      github: { kind: "missing", reason: "Repository not found or private (HTTP 404)", url: base.githubUrl, fetchedAt: now.toISOString() } });
    expect(by(findings, "online")?.status).toBe("UNVERIFIED");
    expect(by(findings, "exists")?.status).toBe("FLAGGED");
  });

  it("treats free-mail contact addresses as needing review", () => {
    const { findings } = runChecks({ ...base, contactEmail: "neuroforge@gmail.com", website: site([]), github: repo() });
    expect(by(findings, "Contact email")?.status).toBe("NEEDS_REVIEW");
  });
});

describe("mergeReport", () => {
  const model: ModelOutput = {
    summary: "Looks rug-proof and guaranteed safe.", recommendation: "proceed_to_human_review", confidence: 0.9,
    limitations: "Did not read private files.", next_steps: ["Call the founder"],
    findings: [
      { category: "consistency", claim: "README matches product", status: "VERIFIED", detail: "Matches.", severity: 1, source_ids: ["S1"] },
      { category: "other", claim: "Team is experienced", status: "VERIFIED", detail: "Seems so.", severity: 1, source_ids: ["S9"] },
    ],
  };
  const sources = new Map([["S1", { url: "https://neuroforge.ai/", fetched_at: now.toISOString() }]]);

  it("drops unknown sources and downgrades unsupported VERIFIED claims", () => {
    const r = mergeReport([], model, sources, []);
    expect(r.findings[0]!.status).toBe("VERIFIED");
    expect(r.findings[0]!.sources).toHaveLength(1);
    expect(r.findings[1]!.status).toBe("UNVERIFIED");
    expect(r.findings[1]!.sources).toHaveLength(0);
  });

  it("removes forbidden assurance language", () => {
    expect(mergeReport([], model, sources, []).summary).not.toMatch(/rug-proof|guaranteed safe/i);
    expect(scrub("This is risk-free")).toContain("[removed");
  });

  it("caps confidence when anything is flagged", () => {
    const flagged = [{ category: "website" as const, claim: "x", status: "FLAGGED" as const, detail: "d", severity: 4 as const, sources: [] }];
    expect(mergeReport(flagged, model, sources, []).confidence).toBe(0.5);
  });
});
