import type { GitHubEvidence } from "./fetchers/github";
import type { Finding, Source } from "./report";

export type WebsiteEvidence =
  | { ok: true; requestedUrl: string; url: string; status: number; fetchedAt: string; sha256: string; title: string; text: string; links: string[] }
  | { ok: false; requestedUrl: string; fetchedAt: string; error: string };

export type CheckInput = {
  websiteUrl: string | null;
  xUrl: string | null;
  githubUrl: string | null;
  contactEmail: string | null;
  website: WebsiteEvidence | null;
  github: GitHubEvidence | null;
  now?: Date;
};

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "gmx.com"]);
const DAY = 86_400_000;

/** Registrable-ish domain: last two labels (good enough for comparing a company's own domains; flagged for human review when it matters). */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  const twoLevelTld = parts.length > 2 && ["co", "com", "org", "net", "ac", "gov"].includes(parts[parts.length - 2]!) && parts[parts.length - 1]!.length === 2;
  return parts.slice(twoLevelTld ? -3 : -2).join(".");
}
const hostOf = (u: string | null) => { try { return u ? new URL(u).hostname : null; } catch { return null; } };

export function xHandle(url: string | null): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com", "mobile.twitter.com"].includes(u.hostname.toLowerCase())) return null;
    const h = u.pathname.split("/").filter(Boolean)[0];
    return h && /^[A-Za-z0-9_]{1,15}$/.test(h) ? h.toLowerCase() : null;
  } catch {
    return null;
  }
}

function githubOwner(url: string): string | null {
  try {
    const u = new URL(url);
    if (!["github.com", "www.github.com"].includes(u.hostname.toLowerCase())) return null;
    return u.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function runChecks(input: CheckInput): { findings: Finding[]; limitations: string[] } {
  const now = input.now ?? new Date();
  const findings: Finding[] = [];
  const limitations: string[] = [
    "Founder identity and authorization cannot be established from public sources and must be verified by a person.",
    "X (Twitter) content was not fetched; X accounts are checked only through links to and from the website and GitHub.",
    "Token tickers on other launchpads and exchanges were not checked for collisions.",
  ];

  const site = input.website;
  const siteSrc: Source[] = site?.ok ? [{ url: site.url, fetched_at: site.fetchedAt, content_sha256: site.sha256, http_status: site.status }] : [];
  const siteDomain = hostOf(input.websiteUrl) ? baseDomain(hostOf(input.websiteUrl)!) : null;

  // Website reachability
  if (!input.websiteUrl) {
    findings.push({ category: "website", claim: "Official website", status: "FLAGGED", detail: "No website was submitted.", severity: 4, sources: [] });
  } else if (!site || !site.ok) {
    findings.push({ category: "website", claim: `Website ${input.websiteUrl} is online`, status: "UNVERIFIED",
      detail: `The website could not be fetched: ${site && !site.ok ? site.error : "not attempted"}.`, severity: 3,
      sources: [{ url: input.websiteUrl, fetched_at: site?.fetchedAt ?? now.toISOString(), http_status: null }] });
  } else if (site.status >= 400) {
    findings.push({ category: "website", claim: `Website ${input.websiteUrl} is online`, status: "FLAGGED",
      detail: `The website returned HTTP ${site.status}.`, severity: 3, sources: siteSrc });
  } else {
    const finalDomain = baseDomain(new URL(site.url).hostname);
    if (siteDomain && finalDomain !== siteDomain) {
      findings.push({ category: "website", claim: `Website ${input.websiteUrl} is online`, status: "NEEDS_REVIEW",
        detail: `The website redirects to a different domain (${finalDomain}).`, severity: 3, sources: siteSrc });
    } else {
      findings.push({ category: "website", claim: `Website ${input.websiteUrl} is online`, status: "VERIFIED",
        detail: `Fetched successfully (HTTP ${site.status})${site.title ? `, page title “${site.title}”` : ""}.`, severity: 1, sources: siteSrc });
    }
  }

  // Cross-links from website
  const ghOwner = input.githubUrl ? githubOwner(input.githubUrl) : null;
  const handle = xHandle(input.xUrl);
  if (site?.ok) {
    const siteGhOwners = new Set(site.links.map(githubOwner).filter(Boolean));
    if (ghOwner) {
      findings.push(siteGhOwners.has(ghOwner)
        ? { category: "consistency", claim: "Website links to the submitted GitHub account", status: "VERIFIED", detail: `The website links to github.com/${ghOwner}.`, severity: 1, sources: siteSrc }
        : { category: "consistency", claim: "Website links to the submitted GitHub account", status: siteGhOwners.size ? "FLAGGED" : "NEEDS_REVIEW",
            detail: siteGhOwners.size
              ? `The website links to a different GitHub account (${[...siteGhOwners].join(", ")}), not github.com/${ghOwner}.`
              : "The website doesn't link to any GitHub account.", severity: siteGhOwners.size ? 4 : 2, sources: siteSrc });
    }
    if (handle) {
      const siteHandles = new Set(site.links.map(xHandle).filter(Boolean));
      findings.push(siteHandles.has(handle)
        ? { category: "socials", claim: `X account @${handle} is official`, status: "VERIFIED", detail: `The website links to x.com/${handle}.`, severity: 1, sources: siteSrc }
        : { category: "socials", claim: `X account @${handle} is official`, status: siteHandles.size ? "FLAGGED" : "UNVERIFIED",
            detail: siteHandles.size
              ? `The website links to a different X account (@${[...siteHandles].join(", @")}). Possible impersonation or a stale link.`
              : "The website doesn't link to an X account, so the submitted handle couldn't be confirmed.", severity: siteHandles.size ? 4 : 2, sources: siteSrc });
    }
  }

  // GitHub
  const gh = input.github;
  if (input.githubUrl && gh) {
    if (gh.kind === "missing") {
      findings.push({ category: "repository", claim: "GitHub account or repository exists", status: "FLAGGED", detail: gh.reason, severity: 4,
        sources: [{ url: input.githubUrl, fetched_at: gh.fetchedAt }] });
    } else {
      const src: Source[] = [{ url: gh.apiUrl, fetched_at: gh.fetchedAt, content_sha256: gh.sha256, http_status: 200 }];
      if (gh.kind === "repo") {
        const r = gh.repo;
        const ageDays = Math.floor((now.getTime() - Date.parse(r.created_at)) / DAY);
        const idleDays = Math.floor((now.getTime() - Date.parse(r.pushed_at)) / DAY);
        findings.push({ category: "repository", claim: `Repository ${r.full_name} exists and is public`, status: "VERIFIED",
          detail: `Created ${ageDays} days ago, last pushed ${idleDays} days ago, ${r.stargazers_count} stars, ${gh.contributors.length} contributors listed, ${gh.releases.length} recent releases.`, severity: 1, sources: src });
        if (r.archived) findings.push({ category: "repository", claim: "Repository is actively maintained", status: "FLAGGED", detail: "The repository is archived.", severity: 4, sources: src });
        else if (idleDays > 180) findings.push({ category: "repository", claim: "Repository is actively maintained", status: "NEEDS_REVIEW", detail: `No pushes in ${idleDays} days.`, severity: 3, sources: src });
        if (r.fork) findings.push({ category: "repository", claim: "Repository is original work", status: "NEEDS_REVIEW", detail: "The repository is a fork of another project.", severity: 3, sources: src });
        if (ageDays < 30) findings.push({ category: "repository", claim: "Repository has a track record", status: "NEEDS_REVIEW", detail: `The repository is only ${ageDays} days old.`, severity: 3, sources: src });
        if (r.homepage && siteDomain) {
          const hp = hostOf(r.homepage);
          findings.push(hp && baseDomain(hp) === siteDomain
            ? { category: "consistency", claim: "Repository points back to the official website", status: "VERIFIED", detail: `Repository homepage is ${r.homepage}.`, severity: 1, sources: src }
            : { category: "consistency", claim: "Repository points back to the official website", status: "NEEDS_REVIEW", detail: `Repository homepage is ${r.homepage}, not the submitted website.`, severity: 2, sources: src });
        }
      } else {
        const o = gh.org;
        const ageDays = Math.floor((now.getTime() - Date.parse(o.created_at)) / DAY);
        findings.push({ category: "repository", claim: `GitHub ${o.type === "Organization" ? "organization" : "account"} ${o.login} exists`, status: "VERIFIED",
          detail: `Created ${ageDays} days ago with ${o.public_repos} public repositories.`, severity: 1, sources: src });
        if (handle && o.twitter_username) {
          findings.push(o.twitter_username.toLowerCase() === handle
            ? { category: "socials", claim: `GitHub profile lists @${handle}`, status: "VERIFIED", detail: "The GitHub profile's X username matches.", severity: 1, sources: src }
            : { category: "socials", claim: `GitHub profile lists @${handle}`, status: "FLAGGED", detail: `The GitHub profile lists @${o.twitter_username} instead.`, severity: 4, sources: src });
        }
        if (o.blog && siteDomain) {
          const b = hostOf(o.blog.startsWith("http") ? o.blog : `https://${o.blog}`);
          if (b && baseDomain(b) === siteDomain) {
            findings.push({ category: "consistency", claim: "GitHub profile points to the official website", status: "VERIFIED", detail: `Profile website is ${o.blog}.`, severity: 1, sources: src });
          }
        }
      }
    }
  } else if (!input.githubUrl) {
    findings.push({ category: "repository", claim: "GitHub presence", status: "UNVERIFIED", detail: "No GitHub link was submitted.", severity: 2, sources: [] });
  }

  // Contact email
  const emailDomain = input.contactEmail?.split("@")[1]?.toLowerCase() ?? null;
  if (emailDomain && siteDomain) {
    if (FREE_MAIL.has(emailDomain)) {
      findings.push({ category: "identity", claim: "Contact email belongs to the company", status: "NEEDS_REVIEW", detail: `The contact email uses a free mail provider (${emailDomain}).`, severity: 2, sources: [] });
    } else if (baseDomain(emailDomain) === siteDomain) {
      findings.push({ category: "identity", claim: "Contact email belongs to the company", status: "VERIFIED", detail: `The contact email is on the website's domain (${siteDomain}). Ownership of the inbox was confirmed at sign-up.`, severity: 1, sources: [] });
    } else {
      findings.push({ category: "identity", claim: "Contact email belongs to the company", status: "NEEDS_REVIEW", detail: `The contact email domain (${emailDomain}) differs from the website (${siteDomain}).`, severity: 3, sources: [] });
    }
  }

  findings.push({ category: "identity", claim: "Applicant is authorized by the founder", status: "NEEDS_REVIEW",
    detail: "Uploaded authorization and the founder's written approval must be checked by a reviewer. The AI does not read private evidence files.", severity: 3, sources: [] });

  return { findings, limitations };
}
