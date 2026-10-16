# startit.fun — Architecture & Implementation Plan

Status: **Phase 3 built** (2026-10-16): four-way split, launch configuration with wallet-signed terms, LaunchLab devnet launch with on-chain verification, fee indexing, Squads payout proposals, reconciliation. Not yet exercised against devnet. Phase 4 (security testing) next.

## Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Codebase | Greenfield in `SolCallit/startit.fun` | Nothing to reuse |
| Chain | Solana (devnet first) | Meme-token liquidity + culture |
| Launch mechanism | **Raydium LaunchLab** (Startit registered as a LaunchLab *platform*) | Founder's call. Battle-tested curve + auto-migration to Raydium CPMM, devnet program, `raydium-sdk-v2`. No custom curve contract to audit |
| Product | Standalone (not on HatchHL protocol) | Per founder decision |

Considered: **Meteora DBC** (native partner/creator split) — not chosen. **Custom Anchor program** — needs an external audit before mainnet; revisit only if LaunchLab blocks a requirement.

Program IDs (cross-check against `api-v3.raydium.io/main/info` before signing):

| | Mainnet | Devnet |
|---|---|---|
| LaunchLab | `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` | `DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6` |
| CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` |

## Stack

- **Web:** Next.js (App Router) · React · TypeScript (strict) · Tailwind
- **DB/Auth/Storage:** Supabase Postgres + Auth + private Storage bucket for evidence
- **Jobs:** Postgres-backed queue via `claim_next_screening()` (`FOR UPDATE SKIP LOCKED`); runs after submit, from a cron endpoint, or a worker script
- **AI:** `ScreeningProvider` interface → `AnthropicProvider`, `OpenAIProvider`; structured JSON output validated with Zod
- **GitHub:** REST API via fine-grained token (server-only)
- **Solana:** `@solana/web3.js` + `@raydium-io/raydium-sdk-v2` (`raydium.launchpad.*`); Squads multisig for treasuries + the Fee Router
- **Observability:** JSON structured logs, DB audit log (hash-chained); Sentry in Phase 5
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
    launch/               # LaunchLab pool builder, tx preview, confirm, submit, verify
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

## Fee mechanics on Raydium LaunchLab

LaunchLab has three fee streams that a platform can capture. Raydium's own trade fee is charged on top and never enters our split. Everything Startit captures is the **distributable fee**, and all of it lands in one place: the **Fee Router** (Squads multisig vault).

| Stream | When | LaunchLab setting | Goes to |
|---|---|---|---|
| Platform fee | Pre-graduation, every trade | `fee_rate` (cap 500 bps) → `platform_fee_wallet` | Fee Router |
| LP fee share | Post-graduation (CPMM) | `platform_scale` → Fee Key NFT → `platform_nft_wallet`; remainder burned | Fee Router |
| CPMM creator fee | Post-graduation | `updatePlatformCpCreator` → Fee Router address | Fee Router |
| LaunchLab creator fee | Pre-graduation | `creator_fee_rate` = **0** | — (founder paid by router instead) |

The Fee Router then pays out per each launch's approved `fee_config`: **15% platform · 30% founder · 5% launcher · 50% community treasury.** When the founder launches their own project there's no separate launcher and the platform takes 20% (20 / 30 / 0 / 50). The launcher reward starts only after launch and is forfeited if the project is suspended for misrepresentation.

Pump.fun-style economics (decided 2026-10-16): traders pay ~1.25% total on the bonding curve, matching pump.fun (Startit `fee_rate` = 1.25% − Raydium's live protocol rate, read on-chain at setup); after graduation Startit keeps 100% of the LP-fee share (`platform_scale` = 1,000,000, nothing burned) plus redirected CPMM creator fees — pending devnet confirmation that the Fee Key cannot withdraw liquidity; no launch fee, founders pay only Solana network costs.

Why route the founder through the router too: LaunchLab caps the creator fee at 50 bps and new configs give the creator no post-migration LP share. One path for all three recipients keeps the split exact and reconciliation simple.

**LaunchLab constraints that shape ops:**
- `fee_rate`, `platform_scale` and `updatePlatformCpCreator` are **platform-wide**, not per-token. Per-launch split differences live in our `fee_configs`, applied at payout.
- `updatePlatformCpCreator` only affects future migrations and config updates are rate-limited per epoch — set it once, before the first launch.
- Fees may arrive as WSOL; the router unwraps before paying SOL.

**Custody (disclosed publicly):** all three shares pass through the Fee Router multisig. Raydium's docs describe this redistribution pattern but provide no built-in multi-recipient split. Every claim and payout is indexed from confirmed transactions only and shown with tx signatures — nothing is simulated. Launch fees are a separate table and never enter the split.

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
| **2** ✅ | Next.js scaffold, Supabase auth + roles, 12-step application with drafts, applicant dashboard, admin review page, screening worker (GitHub + website + provider abstraction), audit views | Built; 69 unit + 29 SQL tests pass. Needs a live Supabase project to run end-to-end |
| **3** ✅ | Fee config UI, agreements (wallet-signed hash), treasury records, LaunchLab devnet launch with preview → dual confirm → submit → on-chain verify, fee indexer, Fee Router payouts + reconciliation | Built; 105 unit + 64 SQL tests pass. Needs a devnet run (README lists what to confirm) |
| **4** | Authz boundary tests, SSRF/prompt-injection corpus, duplicate/failed-job tests, payout failure + retry tests, e2e | CI green |
| **5** | Staging + prod env, monitoring, backups/PITR, runbooks, incident response, mainnet audit checklist | Sign-off |

## Open items

- **Fee Router custody:** with LaunchLab, founder + community shares necessarily route through a Startit-controlled multisig. Alternative: a custom on-chain splitter program as the fee recipient — more trustless, more build + audit.
- **Platform fee rate:** pick LaunchLab `fee_rate` (≤500 bps) and `platform_scale` — these apply to every token on Startit.
- **Launch fee amount** and currency (SOL/USDC).
- **Mainnet:** external review of LaunchLab platform config + Fee Router before any mainnet launch.
