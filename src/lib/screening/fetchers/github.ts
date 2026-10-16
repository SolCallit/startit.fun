import "server-only";
import { createHash } from "node:crypto";

/**
 * GitHub evidence via the REST API (a fixed, trusted destination — no user-controlled host).
 * Only owner/repo segments from the applicant's URL are used, after strict validation.
 */
export type GitHubEvidence =
  | { kind: "missing"; reason: string; url: string; fetchedAt: string }
  | {
      kind: "repo";
      url: string;
      apiUrl: string;
      fetchedAt: string;
      sha256: string;
      repo: {
        full_name: string; owner_type: string; description: string | null; homepage: string | null; created_at: string;
        pushed_at: string; stargazers_count: number; forks_count: number; open_issues_count: number; archived: boolean;
        fork: boolean; license: string | null; default_branch: string;
      };
      recentCommits: { date: string; author: string | null }[];
      releases: { tag: string; published_at: string | null }[];
      contributors: { login: string; contributions: number }[];
      readme: string;
    }
  | {
      kind: "org";
      url: string;
      apiUrl: string;
      fetchedAt: string;
      sha256: string;
      org: { login: string; type: string; name: string | null; blog: string | null; created_at: string; public_repos: number; twitter_username: string | null };
      topRepos: { name: string; pushed_at: string; stargazers_count: number; fork: boolean }[];
    };

const SEG = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export function parseGitHubUrl(url: string): { owner: string; repo?: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !["github.com", "www.github.com"].includes(u.hostname.toLowerCase())) return null;
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    if (!owner || !SEG.test(owner)) return null;
    if (repo !== undefined) {
      const clean = repo.replace(/\.git$/, "");
      if (!REPO.test(clean)) return null;
      return { owner, repo: clean };
    }
    return { owner };
  } catch {
    return null;
  }
}

async function gh<T>(path: string, token?: string, accept = "application/vnd.github+json"): Promise<{ status: number; data: T | null; raw: string }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept,
      "x-github-api-version": "2022-11-28",
      "user-agent": "StartitScreeningBot/1.0",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();
  if (!res.ok) return { status: res.status, data: null, raw };
  try {
    return { status: res.status, data: (accept.includes("raw") ? raw : JSON.parse(raw)) as T, raw };
  } catch {
    return { status: res.status, data: null, raw };
  }
}

export async function fetchGitHubEvidence(url: string, token?: string): Promise<GitHubEvidence> {
  const fetchedAt = new Date().toISOString();
  const parsed = parseGitHubUrl(url);
  if (!parsed) return { kind: "missing", reason: "Not a recognisable github.com link", url, fetchedAt };
  const { owner, repo } = parsed;

  if (!repo) {
    type Org = Extract<GitHubEvidence, { kind: "org" }>["org"];
    const o = await gh<Org>(`/users/${owner}`, token);
    if (!o.data) return { kind: "missing", reason: `GitHub account not found (HTTP ${o.status})`, url, fetchedAt };
    const repos = await gh<{ name: string; pushed_at: string; stargazers_count: number; fork: boolean }[]>(
      `/users/${owner}/repos?sort=pushed&per_page=10`, token);
    return {
      kind: "org", url, apiUrl: `https://api.github.com/users/${owner}`, fetchedAt,
      sha256: createHash("sha256").update(o.raw).digest("hex"),
      org: { login: o.data.login, type: o.data.type, name: o.data.name, blog: o.data.blog, created_at: o.data.created_at,
        public_repos: o.data.public_repos, twitter_username: o.data.twitter_username },
      topRepos: (repos.data ?? []).map((r) => ({ name: r.name, pushed_at: r.pushed_at, stargazers_count: r.stargazers_count, fork: r.fork })),
    };
  }

  type RepoApi = {
    full_name: string; owner: { type: string }; description: string | null; homepage: string | null; created_at: string; pushed_at: string;
    stargazers_count: number; forks_count: number; open_issues_count: number; archived: boolean; fork: boolean;
    license: { spdx_id: string } | null; default_branch: string;
  };
  const r = await gh<RepoApi>(`/repos/${owner}/${repo}`, token);
  if (!r.data) return { kind: "missing", reason: `Repository not found or private (HTTP ${r.status})`, url, fetchedAt };

  const [commits, releases, contributors, readme] = await Promise.all([
    gh<{ commit: { author: { date: string } | null }; author: { login: string } | null }[]>(`/repos/${owner}/${repo}/commits?per_page=30`, token),
    gh<{ tag_name: string; published_at: string | null }[]>(`/repos/${owner}/${repo}/releases?per_page=5`, token),
    gh<{ login: string; contributions: number }[]>(`/repos/${owner}/${repo}/contributors?per_page=10`, token),
    gh<string>(`/repos/${owner}/${repo}/readme`, token, "application/vnd.github.raw+json"),
  ]);

  return {
    kind: "repo", url, apiUrl: `https://api.github.com/repos/${owner}/${repo}`, fetchedAt,
    sha256: createHash("sha256").update(r.raw).digest("hex"),
    repo: {
      full_name: r.data.full_name, owner_type: r.data.owner.type, description: r.data.description, homepage: r.data.homepage,
      created_at: r.data.created_at, pushed_at: r.data.pushed_at, stargazers_count: r.data.stargazers_count, forks_count: r.data.forks_count,
      open_issues_count: r.data.open_issues_count, archived: r.data.archived, fork: r.data.fork,
      license: r.data.license?.spdx_id ?? null, default_branch: r.data.default_branch,
    },
    recentCommits: (commits.data ?? []).map((c) => ({ date: c.commit.author?.date ?? "", author: c.author?.login ?? null })),
    releases: (releases.data ?? []).map((x) => ({ tag: x.tag_name, published_at: x.published_at })),
    contributors: (contributors.data ?? []).map((c) => ({ login: c.login, contributions: c.contributions })),
    readme: (readme.data ?? "").slice(0, 8_000),
  };
}
