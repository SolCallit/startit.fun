# startit.fun

Founder-approved, AI-screened community token launchpad on Solana (Raydium LaunchLab).
Architecture and phased plan: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · Supabase (Postgres, Auth, Storage) · Zod · Vitest

## What works today (Phase 2)

| Area | Status |
|---|---|
| Public pages: landing, projects directory, project profile, methodology, terms | Working. Directory reads live data; shows an honest empty state with no DB |
| Accounts: sign up, email confirmation, sign in/out, roles | Working once Supabase is connected |
| Founder application: 6 screens / 12 sections, drafts, evidence upload, submit | Working once Supabase is connected |
| Applicant dashboard, status timeline, evidence requests + resubmit | Working once Supabase is connected |
| Operator dashboard + review page, decisions, notes, decision history | Working once Supabase is connected |
| AI screening (Claude or OpenAI), SSRF-guarded fetching, GitHub checks | Working once Supabase + an AI key are connected |
| Fee config, agreements, LaunchLab devnet launch, payouts | **Not built yet** (Phase 3). No financial figures are simulated anywhere |

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

Checks:

```bash
pnpm test        # unit tests (Vitest)
pnpm test:db     # spins up a throwaway Postgres, applies migrations, runs SQL invariant tests
pnpm typecheck && pnpm lint && pnpm build
```

## Setting up Supabase

1. **Create a project** at supabase.com.
2. **Run the migrations in order** in the SQL editor (or with the Supabase CLI):
   `db/migrations/0001_init.sql` → `0002_…` → `0003_…` → `0004_…`.
   Never run `db/test/bootstrap_local.sql` against Supabase — it's a local stub.
3. **Auth → URL configuration:** set Site URL to your deployed URL.
4. **Auth → Email templates → Confirm signup:** point the link at
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
5. **Vercel environment variables:** copy every key from `.env.example`.
   `NEXT_PUBLIC_*` keys are safe for the browser; everything else is server-only.

### Make yourself an operator

Sign up through the app, confirm your email, then in the SQL editor:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@yourdomain.com';
```

### Create the screening service account

The AI worker signs in as its own user with **only** the `screening_service` role, so the database limits what it can do: read applications, record reports, and move applications through screening. It can never approve.

1. Supabase → Authentication → Users → **Add user** (auto-confirm), using `SCREENING_SERVICE_EMAIL` / `SCREENING_SERVICE_PASSWORD`.
2. In the SQL editor:

```sql
delete from user_roles where user_id = (select id from auth.users where email = 'screening@yourdomain.com');
insert into user_roles (user_id, role)
select id, 'screening_service' from auth.users where email = 'screening@yourdomain.com';
```

### How screening runs

- **On submit:** the app screens the application in the background right after the founder submits (`after()`).
- **Backstop:** `GET /api/cron/screening` with `Authorization: Bearer $CRON_SECRET` processes anything left in the queue. Point a scheduler at it (Vercel Cron on Pro, or any external cron).
- **Self-hosted:** `pnpm worker:screening` polls every 30 s (`--once` to drain and exit).

A run that fails three times sends the application to human review with the failure recorded.

## Security model (short version)

- Roles and status transitions are enforced in Postgres (RLS + `transition_application()`), not only in the UI.
- Applicants and the AI agent cannot approve. Approval needs an operator, identity and authorization confirmations, and a written note.
- Decision history, audit log and fee claims are append-only; the audit log is hash-chained.
- Evidence files live in a private bucket; reviewers get 5-minute signed links.
- The screener fetches only public https URLs, re-checked at connect time and after every redirect, and treats all fetched content as untrusted.
