# startit.fun — Architecture & Implementation Plan

Status: **Phase 1 complete** (2026-10-16). Repo was empty (README + MIT license). Greenfield build.

## Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Codebase | Greenfield in `SolCallit/startit.fun` | Nothing to reuse |
| Chain | Solana (devnet first) | Meme-token liquidity + culture |
| Launch mechanism | **Meteora Dynamic Bonding Curve (DBC)** | Native partner/creator fee split, locked LP post-migration, devnet program, TS SDK. No custom curve contract to audit |
| Product | Standalone (not on HatchHL protocol) | Per founder decision |

Rejected: **Raydium LaunchLab** — creator fee is capped at 50 bps pre-graduation and, since Aug 2026, new configs can't give the creator a post-migration LP share; the founder's 30% can't be expressed natively. **Custom Anchor program** — full control but needs an external audit before mainnet; revisit only if DBC blocks a requirement.

## Stack

- **Web:** Next.js (App Router) · React · TypeScript (strict) · Tailwind
- **DB/Auth/Storage:** Supabase Postgres + Auth + private Storage bucket for evidence
- **Jobs:** Postgres-backed queue (`pg-boss`) — no Redis until volume demands it
- **AI:** `ScreeningProvider` interface → `AnthropicProvider`, `OpenAIProvider`; structured JSON output validated with Zod
- **GitHub:** REST API via fine-grained token (server-only)
- **Solana:** `@solana/web3.js` + `@meteora-ag/dynamic-bonding-curve-sdk`; Squads multisig for treasury + partner fee wallet
- **Observability:** pino structured logs, Sentry, DB audit log (hash-chained)
- **Tests:** Vitest (unit), SQL invariant tests (`db/test/run.sh`), Playwright (e2e)

## Module layout (one Next.js app, clear boundaries — no microservices)

```
src/
  app/                    # routes: (public) (applicant) (admin) api/
  modules/
    applications/         # form schema (Zod), draft autosave, submit, evidence upload
    review/               # operator actions → transition_application()
    screening/
      providers/          # ScreeningProvider interface, anthropic.ts, openai.ts
      fetchers/           # safeFetch (SSRF guard), github.ts, website.ts
      pipeline.ts         # validate → fetch → analyze → persist findings
    fees/                 # allocation math, Fee Router payout planner, reconciliation
    launch/               # DBC config builder, tx preview, confirm, submit, verify
    chain/                # RPC client, indexer for fee claims/payouts
    audit/
  lib/                    # supabase server client, auth guards, env (validated)
worker/                   # pg-boss consumers: screening, indexer, payouts
db/migrations, db/test
```

## Trust boundaries (enforced in Postgres, not just UI)

- Status changes **only** via `transition_application()`; a trigger rejects direct `UPDATE status`.
- Transition table defines who may do what. Applicant: `draft→submitted` only. AI service: screening states only. **No path lets the AI or applicant approve.**
- RLS: applicants see only their own rows; `operator_notes`, `screening_*` are staff-only. Public pages read from `public_projects` / `public_verification` / `public_payouts` views.
- Fee configs must sum to 10000 bps; non-default splits require a written reason; approved configs are immutable.
- Launch rows can't reach `submitted` without founder confirmation + operator confirmation + stored tx preview.
- `audit_log`, `status_transitions`, `fee_claims` are append-only; audit rows are SHA-256 hash-chained.

## Fee mechanics on Meteora DBC

Per Meteora's docs, the DBC protocol takes **20% of every trading fee off the top** (not configurable by us). The remaining 80% is the **distributable fee**, which DBC splits between *partner* (us) and *creator* via `creator_trading_fee_percentage`.

To produce Startit's 20/30/50 of distributable fees:

| Setting | Value | Result |
|---|---|---|
| `creator_trading_fee_percentage` | 30 | Founder claims **30%** directly on-chain |
| Partner fee claimer | Startit **Fee Router** (Squads multisig) | Receives 70% |
| Fee Router payout | 20/70 → platform, 50/70 → community treasury | **20% platform, 50% community** |

Post-migration LP (locked) fees follow the same partner/creator ratio set in the config and route the same way.

**Custody note (disclosed publicly):** the community's 50% passes through the Fee Router multisig before reaching the treasury. Every claim and payout is indexed from confirmed transactions only and shown with tx signatures; nothing is simulated. Launch fees are a separate table and never enter the split.

## Screening pipeline

1. Validate inputs (Zod) and URLs: `https` only, resolve DNS, reject private/loopback/link-local/metadata IPs, re-check after redirects, size + time limits, content-type allowlist.
2. Fetch: GitHub API (repo meta, commits, releases, contributors, README), website (text only, no JS), X handle consistency.
3. Analyze with provider. Fetched content is wrapped as untrusted data; system prompt forbids following embedded instructions; output must match the findings schema or the run fails.
4. Persist findings (`VERIFIED / UNVERIFIED / NEEDS_REVIEW / FLAGGED`), each with source URL + fetch timestamp + content hash, plus mandatory `limitations`.
5. Recommendation ∈ {proceed to human review, request evidence, recommend rejection}. It never changes status beyond `awaiting_review`.

## Phased plan

| Phase | Deliverable | Done when |
|---|---|---|
| **1** ✅ | Plan, schema, DB invariant tests | 14/14 SQL tests pass |
| **2** | Next.js scaffold, Supabase auth + roles, 12-step application with drafts, applicant dashboard, admin review page, screening worker (GitHub + website + provider abstraction), audit views | Real application screened end-to-end on staging |
| **3** | Fee config UI, agreements (wallet-signed hash), treasury records, DBC devnet launch with preview → dual confirm → submit → on-chain verify, fee indexer, Fee Router payouts + reconciliation | Devnet token launched, fees claimed and split with visible tx sigs |
| **4** | Authz boundary tests, SSRF/prompt-injection corpus, duplicate/failed-job tests, payout failure + retry tests, e2e | CI green |
| **5** | Staging + prod env, monitoring, backups/PITR, runbooks, incident response, mainnet audit checklist | Sign-off |

## Open items

- **Push access:** this session can read the repo but pushes are refused. Install the Claude GitHub App on `SolCallit` (or reconnect GitHub in claude.ai settings) so commits land on a branch.
- **Fee Router custody:** confirm the community share may route through a Startit-controlled multisig (alternative: DBC creator claimer set to a founder+community split contract — more trustless, more build/audit).
- **Launch fee amount** and currency (SOL/USDC).
- **Mainnet:** external review of DBC config + Fee Router before any mainnet launch.
