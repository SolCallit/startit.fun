-- Startit: full database setup for a NEW Supabase project.
-- Paste into Supabase → SQL Editor → Run, once. Generated from db/migrations/0001–0016.

-- ===== 0001_init.sql =====
-- startit.fun — initial schema
-- Target: PostgreSQL 15+ on Supabase (auth.users / auth.uid() provided by Supabase).
-- Local tests stub the auth schema via db/test/bootstrap_local.sql.
--
-- Design rules enforced IN THE DATABASE (not just the app):
--   * Application status changes only through transition_application(); direct UPDATEs of status are rejected.
--   * Applicants may only move draft -> submitted and respond to evidence requests. Never approve.
--   * The AI service account can record screening results and move screening statuses only.
--   * Fee allocations must sum to exactly 10000 bps and are frozen once approved.
--   * Financial rows (fee_events, payouts) and audit_log are append-only / tightly constrained.

create extension if not exists pgcrypto;

-- ───────────────────────── Enums ─────────────────────────
create type app_role as enum ('applicant', 'operator', 'admin', 'screening_service');

create type application_status as enum (
  'draft', 'submitted', 'ai_screening', 'evidence_requested', 'awaiting_review',
  'approved', 'launch_config_pending', 'ready_for_deployment', 'launched',
  'rejected', 'suspended'
);

create type finding_status   as enum ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW', 'FLAGGED');
create type ai_recommendation as enum ('proceed_to_human_review', 'request_evidence', 'recommend_rejection');
create type run_status       as enum ('queued', 'running', 'succeeded', 'failed');
create type link_kind        as enum ('website', 'x', 'github', 'docs', 'demo', 'discord', 'telegram', 'other');
create type evidence_kind    as enum ('authorization', 'founder_approval', 'identity', 'other');
create type network_kind     as enum ('solana-devnet', 'solana-mainnet');
create type launch_status    as enum ('planned', 'previewed', 'operator_confirmed', 'submitted', 'finalized', 'failed');
create type fee_recipient    as enum ('platform', 'founder', 'community');
create type payout_status    as enum ('pending', 'submitted', 'confirmed', 'failed');
create type milestone_status as enum ('submitted', 'confirmed', 'rejected');
create type agreement_kind   as enum ('founder_agreement', 'platform_terms', 'treasury_control', 'fee_allocation');

-- ───────────────────────── Identity & roles ─────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (length(display_name) between 1 and 120),
  email_verified_at timestamptz,
  created_at    timestamptz not null default now()
);

create table user_roles (
  user_id    uuid not null references profiles(id) on delete cascade,
  role       app_role not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = r);
$$;

create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role in ('operator','admin'));
$$;

-- ───────────────────────── Applications ─────────────────────────
create sequence application_ref_seq;

create table applications (
  id              uuid primary key default gen_random_uuid(),
  public_ref      text not null unique
                  default 'STI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('application_ref_seq')::text, 6, '0'),
  applicant_id    uuid not null references profiles(id),
  status          application_status not null default 'draft',
  current_step    smallint not null default 1 check (current_step between 1 and 12),

  -- Project
  project_name    text check (length(project_name) <= 120),
  project_summary text check (length(project_summary) <= 4000),
  applicant_role  text check (length(applicant_role) <= 200),   -- e.g. "co-founder", "authorized rep"

  -- Token proposal
  token_name      text check (length(token_name) <= 32),
  ticker          text check (ticker ~ '^[A-Z0-9]{2,10}$'),
  chain           text not null default 'solana' check (chain = 'solana'),
  token_concept   text check (length(token_concept) <= 4000),
  community_plan  text check (length(community_plan) <= 4000),

  -- Proposed fee split (bps of distributable fees actually collected)
  proposed_platform_bps  int not null default 2000,
  proposed_founder_bps   int not null default 3000,
  proposed_community_bps int not null default 5000,
  constraint proposed_fees_sum check (
    proposed_platform_bps >= 0 and proposed_founder_bps >= 0 and proposed_community_bps >= 0
    and proposed_platform_bps + proposed_founder_bps + proposed_community_bps = 10000),

  -- Disclosures
  disclosures_acknowledged_at timestamptz,
  insider_allocation_disclosure text,

  draft_payload   jsonb not null default '{}'::jsonb,   -- autosave for partially-completed steps
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint submit_requires_core check (
    status = 'draft' or (
      project_name is not null and project_summary is not null and token_name is not null
      and ticker is not null and token_concept is not null and disclosures_acknowledged_at is not null
      and submitted_at is not null))
);

-- One live ticker at a time (rejected / draft don't block).
create unique index applications_live_ticker
  on applications (ticker)
  where status not in ('draft', 'rejected');

-- One non-terminal application per applicant per project name.
create unique index applications_one_active_per_project
  on applications (applicant_id, lower(project_name))
  where status not in ('rejected', 'launched') and project_name is not null;

create table application_links (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind           link_kind not null,
  url            text not null check (url ~* '^https://[^\s/$.?#].[^\s]*$' and length(url) <= 2048),
  label          text,
  created_at     timestamptz not null default now(),
  unique (application_id, url)
);

create table milestone_plans (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  title          text not null check (length(title) <= 200),
  target_date    date,
  description    text
);

create table evidence_files (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind           evidence_kind not null,
  storage_path   text not null unique,            -- private bucket key, never a public URL
  sha256         text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type      text not null,
  byte_size      bigint not null check (byte_size > 0 and byte_size <= 25 * 1024 * 1024),
  uploaded_by    uuid not null references profiles(id),
  uploaded_at    timestamptz not null default now()
);

create table evidence_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  requested_by   uuid not null references profiles(id),
  message        text not null,
  response       text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- Internal only. Never exposed to applicants.
create table operator_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  author_id      uuid not null references profiles(id),
  body           text not null,
  created_at     timestamptz not null default now()
);

-- ───────────────────────── Status machine ─────────────────────────
create table status_transition_rules (
  from_status application_status not null,
  to_status   application_status not null,
  actor       app_role not null,
  primary key (from_status, to_status, actor)
);

insert into status_transition_rules (from_status, to_status, actor) values
  ('draft',                 'submitted',             'applicant'),
  ('evidence_requested',    'submitted',             'applicant'),
  ('submitted',             'ai_screening',          'screening_service'),
  ('ai_screening',          'awaiting_review',       'screening_service'),
  ('ai_screening',          'submitted',             'screening_service'),   -- failed run, re-queue
  ('awaiting_review',       'approved',              'operator'),
  ('awaiting_review',       'evidence_requested',    'operator'),
  ('awaiting_review',       'rejected',              'operator'),
  ('awaiting_review',       'ai_screening',          'operator'),            -- re-run screening
  ('approved',              'launch_config_pending', 'operator'),
  ('launch_config_pending', 'ready_for_deployment',  'operator'),
  ('ready_for_deployment',  'launched',              'operator');

-- Admins inherit every operator transition.
insert into status_transition_rules (from_status, to_status, actor)
  select from_status, to_status, 'admin' from status_transition_rules where actor = 'operator';

-- Staff may suspend from any non-terminal state; admins may lift a suspension back to review.
insert into status_transition_rules (from_status, to_status, actor)
  select s, 'suspended', r
  from unnest(enum_range(null::application_status)) s, unnest(array['operator','admin']::app_role[]) r
  where s not in ('draft', 'rejected', 'suspended');
insert into status_transition_rules values ('suspended', 'awaiting_review', 'admin');

create table status_transitions (       -- immutable decision history
  id             bigint generated always as identity primary key,
  application_id uuid not null references applications(id),
  from_status    application_status not null,
  to_status      application_status not null,
  actor_id       uuid not null references profiles(id),
  actor_role     app_role not null,
  reason         text,
  created_at     timestamptz not null default now()
);

create function block_direct_status_update() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('startit.in_transition', true), '') <> 'on' then
    raise exception 'status may only change via transition_application()' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger applications_status_guard
  before update on applications
  for each row execute function block_direct_status_update();

create function transition_application(p_app uuid, p_to application_status, p_reason text default null)
returns application_status
language plpgsql security definer set search_path = public as $$
declare
  v_app  applications%rowtype;
  v_role app_role;
begin
  select * into v_app from applications where id = p_app for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  -- Pick the most privileged role this caller holds that the rule table allows.
  select r.actor into v_role
  from status_transition_rules r
  join user_roles ur on ur.role = r.actor and ur.user_id = auth.uid()
  where r.from_status = v_app.status and r.to_status = p_to
    and (r.actor <> 'applicant' or v_app.applicant_id = auth.uid())
  order by case r.actor when 'admin' then 1 when 'operator' then 2 when 'screening_service' then 3 else 4 end
  limit 1;

  if v_role is null then
    raise exception 'transition % -> % not permitted for this user', v_app.status, p_to using errcode = '42501';
  end if;

  if p_to in ('rejected', 'suspended', 'evidence_requested') and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required for %', p_to using errcode = '22023';
  end if;

  perform set_config('startit.in_transition', 'on', true);
  update applications
     set status = p_to,
         submitted_at = case when p_to = 'submitted' then now() else submitted_at end
   where id = p_app;
  perform set_config('startit.in_transition', 'off', true);

  insert into status_transitions (application_id, from_status, to_status, actor_id, actor_role, reason)
  values (p_app, v_app.status, p_to, auth.uid(), v_role, p_reason);

  return p_to;
end $$;

-- ───────────────────────── AI screening ─────────────────────────
create table screening_runs (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  status         run_status not null default 'queued',
  provider       text not null,           -- 'anthropic' | 'openai' | ...
  model          text not null,
  prompt_version text not null,
  input_sha256   text not null,           -- hash of the exact application snapshot screened
  attempts       smallint not null default 0 check (attempts between 0 and 5),
  error          text,
  queued_at      timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);
create unique index screening_one_active_run
  on screening_runs (application_id) where status in ('queued', 'running');

create table screening_reports (
  run_id          uuid primary key references screening_runs(id) on delete cascade,
  recommendation  ai_recommendation not null,
  confidence      numeric(3,2) not null check (confidence between 0 and 1),
  summary         text not null,
  limitations     text not null,          -- mandatory: what was NOT checked
  next_steps      jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create table screening_findings (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references screening_runs(id) on delete cascade,
  category   text not null,               -- identity | repository | website | socials | token_disclosure | ...
  claim      text not null,
  status     finding_status not null,
  detail     text not null,
  severity   smallint not null default 1 check (severity between 1 and 5)
);

create table finding_sources (
  id             uuid primary key default gen_random_uuid(),
  finding_id     uuid not null references screening_findings(id) on delete cascade,
  url            text not null,
  fetched_at     timestamptz not null,
  content_sha256 text check (content_sha256 ~ '^[a-f0-9]{64}$'),
  http_status    smallint
);

-- ───────────────────────── Fees, agreements, treasury ─────────────────────────
create table fee_configs (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  platform_bps   int not null check (platform_bps  between 0 and 10000),
  founder_bps    int not null check (founder_bps   between 0 and 10000),
  community_bps  int not null check (community_bps between 0 and 10000),
  constraint fee_sum_exact check (platform_bps + founder_bps + community_bps = 10000),
  is_default     boolean generated always as
                 (platform_bps = 2000 and founder_bps = 3000 and community_bps = 5000) stored,
  deviation_reason text,
  constraint non_default_needs_reason check (is_default or coalesce(trim(deviation_reason), '') <> ''),
  approved_by    uuid references profiles(id),
  approved_at    timestamptz,
  disclosed_at   timestamptz,             -- published on the public profile
  created_at     timestamptz not null default now()
);

create function freeze_approved_fee_config() returns trigger
language plpgsql as $$
begin
  if old.approved_at is not null then
    if tg_op = 'DELETE' then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
    -- Only allow setting disclosed_at once after approval.
    if (new.platform_bps, new.founder_bps, new.community_bps, new.approved_by, new.approved_at, new.deviation_reason)
       is distinct from
       (old.platform_bps, old.founder_bps, old.community_bps, old.approved_by, old.approved_at, old.deviation_reason)
       or (old.disclosed_at is not null and new.disclosed_at is distinct from old.disclosed_at) then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger fee_configs_freeze
  before update or delete on fee_configs
  for each row execute function freeze_approved_fee_config();

create table agreements (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references applications(id),
  kind             agreement_kind not null,
  version          text not null,
  document_sha256  text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path     text not null,
  public_url       text,                    -- set when published
  signer_id        uuid references profiles(id),
  signer_wallet    text,                    -- base58 pubkey
  wallet_signature text,                    -- ed25519 sig over document_sha256 (verified server-side)
  signed_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (application_id, kind, version)
);

create table treasuries (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null unique references applications(id),
  address             text not null check (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  is_multisig         boolean not null,
  threshold           smallint,
  signers             text[] not null default '{}',
  control_rules       text not null,           -- plain-language disclosure shown publicly
  verified_onchain_at timestamptz,
  constraint multisig_shape check (
    not is_multisig or (threshold is not null and threshold >= 1 and threshold <= cardinality(signers)))
);

-- ───────────────────────── Launches & on-chain records ─────────────────────────
create table launches (
  id                       uuid primary key default gen_random_uuid(),
  application_id           uuid not null unique references applications(id),
  fee_config_id            uuid not null references fee_configs(id),
  network                  network_kind not null default 'solana-devnet',
  status                   launch_status not null default 'planned',
  launchlab_platform_config text,          -- Startit's LaunchLab platform config account
  launchlab_pool_address   text,            -- bonding-curve pool
  cpmm_pool_address        text,            -- set after graduation/migration
  fee_key_nft_mint         text,            -- platform's post-migration LP Fee Key NFT
  graduated_at             timestamptz,
  mint_address             text,
  total_supply_raw         numeric(39,0),
  decimals                 smallint,
  mint_authority_revoked   boolean,
  freeze_authority_revoked boolean,
  insider_allocations      jsonb not null default '[]'::jsonb,
  tx_preview               jsonb,          -- exact instructions shown to the operator
  founder_confirmed_at     timestamptz,
  operator_confirmed_by    uuid references profiles(id),
  operator_confirmed_at    timestamptz,
  tx_signature             text unique,
  finalized_slot           bigint,
  error                    text,
  created_at               timestamptz not null default now(),
  constraint confirm_before_submit check (
    status in ('planned', 'previewed', 'failed')
    or (founder_confirmed_at is not null and operator_confirmed_at is not null and tx_preview is not null))
);

-- Separate from trading fees; not part of the 3-way split.
create table launch_fee_payments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  amount_raw     numeric(39,0) not null check (amount_raw > 0),
  quote_mint     text not null,
  tx_signature   text not null unique,
  confirmed_slot bigint not null,
  recorded_at    timestamptz not null default now()
);

-- Only written by the chain indexer from confirmed transactions. No simulated rows.
create table fee_claims (
  id             uuid primary key default gen_random_uuid(),
  launch_id      uuid not null references launches(id),
  source         text not null check (source in ('platform_fee', 'lp_fee_key', 'cpmm_creator_fee')),
  amount_raw     numeric(39,0) not null check (amount_raw >= 0),
  quote_mint     text not null,
  tx_signature   text not null,
  slot           bigint not null,
  observed_at    timestamptz not null default now(),
  unique (tx_signature, launch_id, source)
);

create table payouts (
  id                uuid primary key default gen_random_uuid(),
  launch_id         uuid not null references launches(id),
  source_claim_id   uuid not null references fee_claims(id),
  recipient         fee_recipient not null,
  recipient_address text not null,
  amount_raw        numeric(39,0) not null check (amount_raw >= 0),
  status            payout_status not null default 'pending',
  tx_signature      text unique,
  attempts          smallint not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_claim_id, recipient)
);

-- ───────────────────────── Public milestones ─────────────────────────
create table milestones (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  submitted_by   uuid not null references profiles(id),
  title          text not null check (length(title) <= 200),
  body           text,
  source_url     text not null check (source_url ~* '^https://'),
  status         milestone_status not null default 'submitted',
  verified_by    uuid references profiles(id),
  verified_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ───────────────────────── Audit log (append-only, hash-chained) ─────────────────────────
create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  actor_kind text not null check (actor_kind in ('user', 'service', 'ai', 'system')),
  action     text not null,
  entity     text not null,
  entity_id  text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now(),
  prev_hash  text,
  row_hash   text not null
);

create function audit_log_chain() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('audit_log_chain'));
  select row_hash into new.prev_hash from audit_log order by id desc limit 1;
  new.row_hash := encode(digest(
      coalesce(new.prev_hash, '') || coalesce(new.actor_id::text, '') || new.actor_kind || new.action
      || new.entity || new.entity_id || coalesce(new.before::text, '') || coalesce(new.after::text, '')
      || new.created_at::text, 'sha256'), 'hex');
  return new;
end $$;

create trigger audit_log_chain before insert on audit_log
  for each row execute function audit_log_chain();

create function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function forbid_mutation();
create trigger status_transitions_immutable before update or delete on status_transitions
  for each row execute function forbid_mutation();
create trigger fee_claims_immutable before update or delete on fee_claims
  for each row execute function forbid_mutation();

-- Generic audit trigger for sensitive tables.
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, actor_kind, action, entity, entity_id, before, after)
  values (auth.uid(),
          case when auth.uid() is null then 'system' else 'user' end,
          lower(tg_op), tg_table_name,
          coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id',
                   (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'user_id') || ':' ||
                   (coalesce(to_jsonb(new), to_jsonb(old)) ->> 'role'),
                   'unknown'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_status_transitions after insert on status_transitions for each row execute function audit_row();
create trigger audit_fee_configs        after insert or update or delete on fee_configs for each row execute function audit_row();
create trigger audit_launches           after insert or update on launches  for each row execute function audit_row();
create trigger audit_payouts            after insert or update on payouts   for each row execute function audit_row();
create trigger audit_agreements         after insert or update on agreements for each row execute function audit_row();
create trigger audit_treasuries         after insert or update on treasuries for each row execute function audit_row();
create trigger audit_user_roles         after insert or delete on user_roles for each row execute function audit_row();

-- ───────────────────────── Row-level security ─────────────────────────
alter table profiles            enable row level security;
alter table user_roles          enable row level security;
alter table applications        enable row level security;
alter table application_links   enable row level security;
alter table milestone_plans     enable row level security;
alter table evidence_files      enable row level security;
alter table evidence_requests   enable row level security;
alter table operator_notes      enable row level security;
alter table status_transitions  enable row level security;
alter table screening_runs      enable row level security;
alter table screening_reports   enable row level security;
alter table screening_findings  enable row level security;
alter table finding_sources     enable row level security;
alter table fee_configs         enable row level security;
alter table agreements          enable row level security;
alter table treasuries          enable row level security;
alter table launches            enable row level security;
alter table launch_fee_payments enable row level security;
alter table fee_claims          enable row level security;
alter table payouts             enable row level security;
alter table milestones          enable row level security;
alter table audit_log           enable row level security;

-- Profiles
create policy profiles_self   on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on profiles for insert with check (id = auth.uid());

-- Roles: users may read their own; only admins grant/revoke.
create policy roles_read  on user_roles for select using (user_id = auth.uid() or is_staff());
create policy roles_admin on user_roles for all using (has_role('admin')) with check (has_role('admin'));

-- Applications: owner sees own; staff see all. Owner edits only while draft / evidence_requested.
create policy apps_read   on applications for select using (applicant_id = auth.uid() or is_staff());
create policy apps_insert on applications for insert
  with check (applicant_id = auth.uid() and status = 'draft');
create policy apps_owner_edit on applications for update
  using (applicant_id = auth.uid() and status in ('draft', 'evidence_requested'))
  with check (applicant_id = auth.uid());
create policy apps_staff_edit on applications for update using (is_staff()) with check (is_staff());

-- Child tables owned through the application.
create function owns_editable_app(p_app uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications
                 where id = p_app and applicant_id = auth.uid()
                   and status in ('draft', 'evidence_requested'));
$$;
create function can_read_app(p_app uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists (select 1 from applications where id = p_app and applicant_id = auth.uid());
$$;

create policy links_read  on application_links for select using (can_read_app(application_id));
create policy links_write on application_links for all
  using (owns_editable_app(application_id)) with check (owns_editable_app(application_id));

create policy mplans_read  on milestone_plans for select using (can_read_app(application_id));
create policy mplans_write on milestone_plans for all
  using (owns_editable_app(application_id)) with check (owns_editable_app(application_id));

create policy evidence_read   on evidence_files for select using (can_read_app(application_id));
create policy evidence_insert on evidence_files for insert
  with check (owns_editable_app(application_id) and uploaded_by = auth.uid());

create policy evreq_read  on evidence_requests for select using (can_read_app(application_id));
create policy evreq_staff on evidence_requests for insert with check (is_staff() and requested_by = auth.uid());
create policy evreq_reply on evidence_requests for update
  using (exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid()))
  with check (exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid()));

-- Internal-only tables: staff (and the screening service where it writes).
create policy notes_staff on operator_notes for all using (is_staff()) with check (is_staff() and author_id = auth.uid());

create policy transitions_read on status_transitions for select using (can_read_app(application_id));

create policy runs_staff   on screening_runs     for select using (is_staff() or has_role('screening_service'));
create policy runs_service on screening_runs     for all    using (has_role('screening_service')) with check (has_role('screening_service'));
create policy runs_queue   on screening_runs     for insert with check (is_staff());
create policy rep_staff    on screening_reports  for select using (is_staff());
create policy rep_service  on screening_reports  for insert with check (has_role('screening_service'));
create policy find_staff   on screening_findings for select using (is_staff());
create policy find_service on screening_findings for insert with check (has_role('screening_service'));
create policy src_staff    on finding_sources    for select using (is_staff());
create policy src_service  on finding_sources    for insert with check (has_role('screening_service'));

-- Fee config: applicant can read their own; staff write. Public reads go through views below.
create policy fees_read  on fee_configs for select using (can_read_app(application_id));
create policy fees_staff on fee_configs for all using (is_staff()) with check (is_staff());

create policy agreements_read  on agreements for select using (can_read_app(application_id));
create policy agreements_staff on agreements for insert with check (is_staff());
create policy agreements_sign  on agreements for update
  using (exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid()) or is_staff())
  with check (exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid()) or is_staff());

create policy treasury_read  on treasuries for select using (can_read_app(application_id));
create policy treasury_staff on treasuries for all using (is_staff()) with check (is_staff());

create policy launches_read  on launches for select using (can_read_app(application_id));
create policy launches_staff on launches for all using (is_staff()) with check (is_staff());

create policy lfp_staff on launch_fee_payments for all using (is_staff()) with check (is_staff());
create policy claims_staff on fee_claims for select using (is_staff());
create policy payouts_staff on payouts for all using (is_staff()) with check (is_staff());

create policy ms_read   on milestones for select using (status = 'confirmed' or can_read_app(application_id));
create policy ms_submit on milestones for insert with check (
  submitted_by = auth.uid() and status = 'submitted'
  and exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid() and a.status = 'launched'));
create policy ms_verify on milestones for update using (is_staff()) with check (is_staff());

create policy audit_admin on audit_log for select using (has_role('admin'));

-- ───────────────────────── Public read models ─────────────────────────
-- Only approved-or-later, non-suspended projects. Exposes no internal notes, evidence, or AI internals.
create view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

-- Public verification summary: statuses and sources only, latest succeeded run.
create view public_verification as
select a.public_ref, f.category, f.claim, f.status, s.url, s.fetched_at
from applications a
join lateral (select id from screening_runs r
              where r.application_id = a.id and r.status = 'succeeded'
              order by finished_at desc limit 1) r on true
join screening_findings f on f.run_id = r.id
left join finding_sources s on s.finding_id = f.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

create view public_payouts as
select a.public_ref, p.recipient, p.recipient_address, p.amount_raw, p.status, p.tx_signature, p.updated_at
from payouts p join launches l on l.id = p.launch_id join applications a on a.id = l.application_id
where a.status = 'launched';

-- Views run as owner, so grant them to anon/authenticated in the Supabase migration wrapper:
--   grant select on public_projects, public_verification, public_payouts to anon, authenticated;

-- ===== 0002_supabase_and_screening_queue.sql =====
-- 0002: Supabase wiring + screening queue RPCs.

-- ───────── New users get a profile and the applicant role ─────────
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, email_verified_at)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Founder'), 120),
          new.email_confirmed_at)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role) values (new.id, 'applicant') on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function handle_user_email_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update profiles set email_verified_at = new.email_confirmed_at where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed after update on auth.users
  for each row execute function handle_user_email_confirmed();

-- ───────── Founder approval fields (step 8 of the application) ─────────
alter table applications
  add column founder_approval_statement text check (length(founder_approval_statement) <= 4000),
  add column permitted_branding text check (length(permitted_branding) <= 2000),
  add column contact_email text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ───────── Screening queue (called only by the screening_service account) ─────────
-- Claims the oldest application waiting for screening, moves it to ai_screening, and opens a run.
create function claim_next_screening(p_provider text, p_model text, p_prompt_version text)
returns table (run_id uuid, application_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_run uuid;
begin
  if not has_role('screening_service') then
    raise exception 'screening_service role required' using errcode = '42501';
  end if;

  select a.* into v_app
  from applications a
  where (a.status = 'submitted'
         or (a.status = 'ai_screening'
             and not exists (select 1 from screening_runs r
                             where r.application_id = a.id and r.status in ('queued', 'running'))))
  order by a.submitted_at nulls last, a.created_at
  for update skip locked
  limit 1;

  if not found then return; end if;

  if v_app.status = 'submitted' then
    perform transition_application(v_app.id, 'ai_screening', null);
  end if;

  insert into screening_runs (application_id, status, provider, model, prompt_version, input_sha256, attempts, started_at)
  values (v_app.id, 'running', p_provider, p_model, p_prompt_version,
          encode(digest(to_jsonb(v_app)::text, 'sha256'), 'hex'), 1, now())
  returning id into v_run;

  run_id := v_run; application_id := v_app.id;
  return next;
end $$;

-- Stores a complete report atomically and hands the application to a human.
-- p_report: { recommendation, confidence, summary, limitations, next_steps[],
--             findings: [{ category, claim, status, detail, severity, sources: [{url, fetched_at, content_sha256, http_status}] }] }
create function complete_screening(p_run uuid, p_report jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_run screening_runs%rowtype;
  f jsonb;
  s jsonb;
  v_finding uuid;
begin
  if not has_role('screening_service') then
    raise exception 'screening_service role required' using errcode = '42501';
  end if;

  select * into v_run from screening_runs where id = p_run for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run % is not running', p_run using errcode = '22023';
  end if;

  insert into screening_reports (run_id, recommendation, confidence, summary, limitations, next_steps)
  values (p_run,
          (p_report ->> 'recommendation')::ai_recommendation,
          (p_report ->> 'confidence')::numeric,
          p_report ->> 'summary',
          p_report ->> 'limitations',
          coalesce(p_report -> 'next_steps', '[]'::jsonb));

  for f in select * from jsonb_array_elements(coalesce(p_report -> 'findings', '[]'::jsonb)) loop
    insert into screening_findings (run_id, category, claim, status, detail, severity)
    values (p_run, f ->> 'category', f ->> 'claim', (f ->> 'status')::finding_status, f ->> 'detail',
            coalesce((f ->> 'severity')::smallint, 1))
    returning id into v_finding;

    for s in select * from jsonb_array_elements(coalesce(f -> 'sources', '[]'::jsonb)) loop
      insert into finding_sources (finding_id, url, fetched_at, content_sha256, http_status)
      values (v_finding, s ->> 'url', (s ->> 'fetched_at')::timestamptz, s ->> 'content_sha256',
              (s ->> 'http_status')::smallint);
    end loop;
  end loop;

  update screening_runs set status = 'succeeded', finished_at = now() where id = p_run;
  perform transition_application(v_run.application_id, 'awaiting_review', null);

  insert into audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  values (auth.uid(), 'ai', 'screening_completed', 'screening_runs', p_run::text,
          jsonb_build_object('recommendation', p_report ->> 'recommendation', 'confidence', p_report ->> 'confidence'));
end $$;

-- Records a failed run. After 3 failed runs the application goes to a human anyway, flagged in the audit log.
create function fail_screening(p_run uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_run screening_runs%rowtype;
  v_failures int;
begin
  if not has_role('screening_service') then
    raise exception 'screening_service role required' using errcode = '42501';
  end if;

  select * into v_run from screening_runs where id = p_run for update;
  if not found or v_run.status <> 'running' then
    raise exception 'run % is not running', p_run using errcode = '22023';
  end if;

  update screening_runs set status = 'failed', error = left(p_error, 2000), finished_at = now() where id = p_run;

  select count(*) into v_failures from screening_runs
  where application_id = v_run.application_id and status = 'failed';

  insert into audit_log (actor_id, actor_kind, action, entity, entity_id, after)
  values (auth.uid(), 'ai', 'screening_failed', 'screening_runs', p_run::text,
          jsonb_build_object('error', left(p_error, 500), 'failures', v_failures));

  if v_failures >= 3 then
    perform transition_application(v_run.application_id, 'awaiting_review',
      'AI screening failed 3 times; manual review required');
  end if;
  -- Otherwise the application stays in ai_screening with no active run, so the next claim retries it.
end $$;

-- Applicants submit through this wrapper so the form can't skip validation done in the DB.
create function submit_application(p_app uuid) returns application_status
language plpgsql security definer set search_path = public as $$
declare v_status application_status;
begin
  select status into v_status from applications where id = p_app and applicant_id = auth.uid();
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from application_links where application_id = p_app and kind = 'website') then
    raise exception 'an official website link is required' using errcode = '22023';
  end if;
  if not exists (select 1 from evidence_files where application_id = p_app and kind = 'founder_approval')
     and not exists (select 1 from applications where id = p_app and coalesce(trim(founder_approval_statement), '') <> '') then
    raise exception 'written founder approval is required' using errcode = '22023';
  end if;
  return transition_application(p_app, 'submitted', null);
end $$;

-- ───────── Grants for Supabase roles ─────────
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects, public_verification, public_payouts to anon, authenticated';
    execute 'revoke execute on function claim_next_screening(text, text, text), complete_screening(uuid, jsonb), fail_screening(uuid, text) from anon';
  end if;
end $$;

-- ───────── Private evidence bucket (Supabase Storage) ─────────
-- Path convention: <applicant uid>/<application id>/<file>. Never public.
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidence', 'evidence', false, 26214400,
            array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'])
    on conflict (id) do nothing;

    execute $p$create policy evidence_owner_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
                  and public.owns_editable_app(((storage.foldername(name))[2])::uuid))$p$;
    execute $p$create policy evidence_owner_read on storage.objects for select to authenticated
      using (bucket_id = 'evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()))$p$;
  end if;
end $$;

-- ===== 0003_review_queue_view.sql =====
-- 0003: review queue read model. security_invoker = true, so the caller's RLS applies:
-- staff see every row, applicants see only their own (and can't see screening internals through it,
-- because screening_* RLS hides those rows → counts come back as 0 / null).
create view review_queue with (security_invoker = true) as
select a.id, a.public_ref, a.project_name, a.ticker, a.status, a.submitted_at, a.updated_at,
       r.id as latest_run_id, r.status as latest_run_status,
       rep.recommendation, rep.confidence,
       coalesce(f.flagged, 0) as flagged_count,
       coalesce(f.needs_review, 0) as needs_review_count
from applications a
left join lateral (
  select id, status from screening_runs sr where sr.application_id = a.id order by sr.queued_at desc limit 1
) r on true
left join screening_reports rep on rep.run_id = r.id
left join lateral (
  select count(*) filter (where status = 'FLAGGED') as flagged,
         count(*) filter (where status = 'NEEDS_REVIEW') as needs_review
  from screening_findings sf where sf.run_id = r.id
) f on true;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on review_queue to authenticated';
  end if;
end $$;

-- ===== 0004_screening_read_access.sql =====
-- 0004: the screening service account may READ the application data it screens.
-- It cannot read operator notes, evidence file contents (storage), fee/launch/payout data, or other users' profiles beyond display name.
create policy apps_screening_read on applications for select using (has_role('screening_service'));
create policy links_screening_read on application_links for select using (has_role('screening_service'));
create policy mplans_screening_read on milestone_plans for select using (has_role('screening_service'));
create policy evidence_meta_screening_read on evidence_files for select using (has_role('screening_service'));
create policy profiles_screening_read on profiles for select using (has_role('screening_service'));

-- ===== 0005_launcher_share.sql =====
-- 0005: four-way fee split. Default 15% platform / 30% founder / 5% launcher / 50% community.
-- When the founder launches their own project there is no separate launcher: 20 / 30 / 0 / 50.

alter type fee_recipient add value if not exists 'launcher';

-- ── Applications ──
alter table applications add column applicant_is_founder boolean;
alter table applications add column proposed_launcher_bps int not null default 500;
alter table applications alter column proposed_platform_bps set default 1500;
alter table applications drop constraint proposed_fees_sum;
alter table applications add constraint proposed_fees_sum check (
  proposed_platform_bps >= 0 and proposed_founder_bps >= 0 and proposed_launcher_bps >= 0 and proposed_community_bps >= 0
  and proposed_platform_bps + proposed_founder_bps + proposed_launcher_bps + proposed_community_bps = 10000);
-- A founder launching their own project can't also take the launcher share.
alter table applications add constraint self_launch_no_launcher_share check (
  applicant_is_founder is not true or proposed_launcher_bps = 0);

-- ── Fee configs ──
alter table fee_configs drop constraint non_default_needs_reason;
alter table fee_configs drop column is_default;
alter table fee_configs drop constraint fee_sum_exact;
alter table fee_configs add column launcher_bps int not null default 0 check (launcher_bps between 0 and 10000);
alter table fee_configs add constraint fee_sum_exact check (platform_bps + founder_bps + launcher_bps + community_bps = 10000);
alter table fee_configs add column is_default boolean generated always as (
  (platform_bps = 1500 and founder_bps = 3000 and launcher_bps = 500 and community_bps = 5000)
  or (platform_bps = 2000 and founder_bps = 3000 and launcher_bps = 0 and community_bps = 5000)) stored;
alter table fee_configs add constraint non_default_needs_reason check (is_default or coalesce(trim(deviation_reason), '') <> '');

create or replace function freeze_approved_fee_config() returns trigger
language plpgsql as $$
begin
  if old.approved_at is not null then
    if tg_op = 'DELETE' then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
    if (new.platform_bps, new.founder_bps, new.launcher_bps, new.community_bps, new.approved_by, new.approved_at, new.deviation_reason)
       is distinct from
       (old.platform_bps, old.founder_bps, old.launcher_bps, old.community_bps, old.approved_by, old.approved_at, old.deviation_reason)
       or (old.disclosed_at is not null and new.disclosed_at is distinct from old.disclosed_at) then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- ── Public read model gains the launcher share (appended column) ──
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

-- ===== 0006_launch_configuration.sql =====
-- 0006: launch configuration, signed terms, readiness gate.

alter type agreement_kind add value if not exists 'launcher_agreement';

-- Platform-wide settings (Fee Router multisig address, etc.). Admin writes; staff read.
create table platform_settings (
  key        text primary key check (key ~ '^[a-z_]{3,64}$'),
  value      text not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;
create policy settings_read  on platform_settings for select using (is_staff());
create policy settings_admin on platform_settings for all using (has_role('admin')) with check (has_role('admin'));
create trigger audit_platform_settings after insert or update on platform_settings for each row execute function audit_row();

-- The launch row is created during configuration and carries the exact terms everyone signs.
alter table launches
  add column founder_wallet  text check (founder_wallet  ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column launcher_wallet text check (launcher_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column terms_text      text,
  add column terms_sha256    text check (terms_sha256 ~ '^[a-f0-9]{64}$');

-- Changing the terms after signatures exist voids those signatures (they reference the old hash);
-- the readiness gate only counts signatures over the current hash.

alter table agreements alter column storage_path drop not null;
alter table agreements
  add column signer_role    text check (signer_role in ('founder', 'launcher')),
  add column signed_message text;

-- One-time signing links. Only a SHA-256 of the token is stored.
create table signing_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  launch_id      uuid not null references launches(id),
  role           text not null check (role in ('founder', 'launcher')),
  token_sha256   text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
  terms_sha256   text not null check (terms_sha256 ~ '^[a-f0-9]{64}$'),
  expected_wallet text not null,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz,
  revoked_at     timestamptz
);
alter table signing_requests enable row level security;
create policy signreq_staff on signing_requests for all using (is_staff()) with check (is_staff());
-- The launcher can see whether their own request exists (not the token, which isn't stored).
create policy signreq_owner_read on signing_requests for select
  using (exists (select 1 from applications a where a.id = application_id and a.applicant_id = auth.uid()));

-- What's still missing before an application may move to ready_for_deployment.
create function launch_blockers(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_launch launches%rowtype;
  v_fc fee_configs%rowtype;
  out text[] := '{}';
begin
  select * into v_app from applications where id = p_app;
  select * into v_launch from launches where application_id = p_app;
  if v_launch.id is null then return array['launch configuration has not been created']; end if;
  select * into v_fc from fee_configs where id = v_launch.fee_config_id;

  if v_fc.approved_at is null then out := array_append(out, 'fee split has not been approved'); end if;
  if not exists (select 1 from treasuries where application_id = p_app) then out := array_append(out, 'community treasury is not set'); end if;
  if v_launch.founder_wallet is null then out := array_append(out, 'founder payout wallet is not set'); end if;
  if v_fc.launcher_bps > 0 and v_launch.launcher_wallet is null then out := array_append(out, 'launcher payout wallet is not set'); end if;
  if v_fc.launcher_bps = 0 and v_launch.launcher_wallet is not null then out := array_append(out, 'launcher wallet set but launcher share is 0%'); end if;
  if v_launch.terms_sha256 is null then out := array_append(out, 'launch terms have not been generated'); end if;
  if v_launch.mint_authority_revoked is distinct from true or v_launch.freeze_authority_revoked is distinct from true then
    out := array_append(out, 'mint and freeze authority must both be revoked at launch');
  end if;
  if not exists (select 1 from platform_settings where key = 'fee_router_address') then out := array_append(out, 'Fee Router address is not configured'); end if;
  if not exists (select 1 from agreements where application_id = p_app and signer_role = 'founder'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.founder_wallet) then
    out := array_append(out, 'founder has not signed the current terms with the founder wallet');
  end if;
  if v_fc.launcher_bps > 0 and not exists (select 1 from agreements where application_id = p_app and signer_role = 'launcher'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.launcher_wallet) then
    out := array_append(out, 'launcher has not signed the current terms with the launcher wallet');
  end if;
  return out;
end $$;

-- Gate the transition itself. Wraps the existing function so every caller is covered.
create or replace function transition_application(p_app uuid, p_to application_status, p_reason text default null)
returns application_status
language plpgsql security definer set search_path = public as $$
declare
  v_app  applications%rowtype;
  v_role app_role;
  v_blockers text[];
begin
  select * into v_app from applications where id = p_app for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  select r.actor into v_role
  from status_transition_rules r
  join user_roles ur on ur.role = r.actor and ur.user_id = auth.uid()
  where r.from_status = v_app.status and r.to_status = p_to
    and (r.actor <> 'applicant' or v_app.applicant_id = auth.uid())
  order by case r.actor when 'admin' then 1 when 'operator' then 2 when 'screening_service' then 3 else 4 end
  limit 1;

  if v_role is null then
    raise exception 'transition % -> % not permitted for this user', v_app.status, p_to using errcode = '42501';
  end if;

  if p_to in ('rejected', 'suspended', 'evidence_requested') and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required for %', p_to using errcode = '22023';
  end if;

  if p_to = 'ready_for_deployment' then
    v_blockers := launch_blockers(p_app);
    if cardinality(v_blockers) > 0 then
      raise exception 'not ready for deployment: %', array_to_string(v_blockers, '; ') using errcode = '22023';
    end if;
    -- Publishing the split is part of becoming ready: it must be public before launch.
    update fee_configs set disclosed_at = now()
    where id = (select fee_config_id from launches where application_id = p_app) and disclosed_at is null;
  end if;

  perform set_config('startit.in_transition', 'on', true);
  update applications
     set status = p_to,
         submitted_at = case when p_to = 'submitted' then now() else submitted_at end
   where id = p_app;
  perform set_config('startit.in_transition', 'off', true);

  insert into status_transitions (application_id, from_status, to_status, actor_id, actor_role, reason)
  values (p_app, v_app.status, p_to, auth.uid(), v_role, p_reason);

  return p_to;
end $$;

-- Terms are frozen once the application is ready for deployment.
create function freeze_launch_terms() returns trigger
language plpgsql as $$
begin
  if (select status from applications where id = old.application_id) in ('ready_for_deployment', 'launched')
     and (new.terms_sha256, new.founder_wallet, new.launcher_wallet, new.fee_config_id, new.total_supply_raw, new.decimals,
          new.mint_authority_revoked, new.freeze_authority_revoked, new.insider_allocations, new.network)
         is distinct from
         (old.terms_sha256, old.founder_wallet, old.launcher_wallet, old.fee_config_id, old.total_supply_raw, old.decimals,
          old.mint_authority_revoked, old.freeze_authority_revoked, old.insider_allocations, old.network) then
    raise exception 'launch terms are frozen once ready for deployment' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger launches_freeze_terms before update on launches for each row execute function freeze_launch_terms();

-- Public: the signed terms text is published with the project.
create view public_launch_terms with (security_barrier = true) as
select a.public_ref, l.terms_text, l.terms_sha256,
       (select max(signed_at) from agreements g where g.application_id = a.id and g.signer_role = 'founder' and g.document_sha256 = l.terms_sha256) as founder_signed_at,
       (select max(signed_at) from agreements g where g.application_id = a.id and g.signer_role = 'launcher' and g.document_sha256 = l.terms_sha256) as launcher_signed_at
from applications a join launches l on l.application_id = a.id
where a.status in ('ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_launch_terms to anon, authenticated';
    execute 'revoke execute on function launch_blockers(uuid) from anon';
  end if;
end $$;

-- ===== 0007_launch_execution.sql =====
-- 0007: launch execution and on-chain verification.

alter table launches
  add column launchlab_platform_id   text,
  add column preview_message_sha256  text check (preview_message_sha256 ~ '^[a-f0-9]{64}$'),
  add column previewed_at            timestamptz,
  add column submitted_at            timestamptz,
  add column verified_at             timestamptz,
  add column verified_mint_authority text,      -- null = revoked; otherwise the on-chain holder
  add column verified_freeze_authority text,
  add column verified_supply_raw     numeric(39,0),
  add column verification            jsonb;

-- The operator can only confirm a preview that exists, after the founder has signed.
alter table launches add constraint operator_confirms_after_founder check (
  operator_confirmed_at is null or (founder_confirmed_at is not null and preview_message_sha256 is not null));

-- Status moves forward only (failed can be retried from planned/previewed).
create function guard_launch_status() returns trigger
language plpgsql as $$
declare
  ok boolean;
begin
  if old.status in ('submitted', 'finalized') and new.tx_signature is distinct from old.tx_signature then
    raise exception 'the launch transaction signature cannot change once submitted' using errcode = '42501';
  end if;
  if old.status = 'finalized' and (new.mint_address, new.verified_at, new.verified_mint_authority, new.verified_freeze_authority, new.verified_supply_raw)
     is distinct from (old.mint_address, old.verified_at, old.verified_mint_authority, old.verified_freeze_authority, old.verified_supply_raw) then
    raise exception 'a finalized launch record cannot be edited' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('planned','previewed'), ('previewed','previewed'), ('previewed','operator_confirmed'), ('operator_confirmed','previewed'),
    ('operator_confirmed','submitted'), ('submitted','finalized'), ('submitted','failed'),
    ('failed','previewed'), ('previewed','failed'), ('operator_confirmed','failed'));
  if not ok then
    raise exception 'launch status cannot move from % to %', old.status, new.status using errcode = '22023';
  end if;
  if new.status = 'finalized' and (new.verified_at is null or new.verified_freeze_authority is not null) then
    raise exception 'a launch is finalized only after on-chain verification with no freeze authority' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger launches_status_guard before update on launches for each row execute function guard_launch_status();

-- The application becomes "launched" only from a finalized launch.
create or replace function launch_blockers(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_launch launches%rowtype;
  v_fc fee_configs%rowtype;
  out text[] := '{}';
begin
  select * into v_app from applications where id = p_app;
  select * into v_launch from launches where application_id = p_app;
  if v_launch.id is null then return array['launch configuration has not been created']; end if;
  select * into v_fc from fee_configs where id = v_launch.fee_config_id;

  if v_fc.approved_at is null then out := array_append(out, 'fee split has not been approved'); end if;
  if not exists (select 1 from treasuries where application_id = p_app) then out := array_append(out, 'community treasury is not set'); end if;
  if v_launch.founder_wallet is null then out := array_append(out, 'founder payout wallet is not set'); end if;
  if v_fc.launcher_bps > 0 and v_launch.launcher_wallet is null then out := array_append(out, 'launcher payout wallet is not set'); end if;
  if v_fc.launcher_bps = 0 and v_launch.launcher_wallet is not null then out := array_append(out, 'launcher wallet set but launcher share is 0%'); end if;
  if v_launch.terms_sha256 is null then out := array_append(out, 'launch terms have not been generated'); end if;
  if v_launch.mint_authority_revoked is distinct from true or v_launch.freeze_authority_revoked is distinct from true then
    out := array_append(out, 'mint and freeze authority must both be revoked at launch');
  end if;
  if not exists (select 1 from platform_settings where key = 'fee_router_address') then out := array_append(out, 'Fee Router address is not configured'); end if;
  if not exists (select 1 from agreements where application_id = p_app and signer_role = 'founder'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.founder_wallet) then
    out := array_append(out, 'founder has not signed the current terms with the founder wallet');
  end if;
  if v_fc.launcher_bps > 0 and not exists (select 1 from agreements where application_id = p_app and signer_role = 'launcher'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.launcher_wallet) then
    out := array_append(out, 'launcher has not signed the current terms with the launcher wallet');
  end if;
  if v_app.status = 'ready_for_deployment' and v_launch.status <> 'finalized' then
    out := array_append(out, 'launch transaction has not been verified on-chain');
  end if;
  return out;
end $$;

create or replace function guard_launched_transition() returns trigger
language plpgsql as $$
begin
  if new.to_status = 'launched' and not exists (
       select 1 from launches where application_id = new.application_id and status = 'finalized' and verified_at is not null) then
    raise exception 'an application is launched only after its launch is verified on-chain' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger status_transitions_launched_guard before insert on status_transitions
  for each row execute function guard_launched_transition();

-- ===== 0008_payouts.sql =====
-- 0008: payouts through Squads proposals, reconciliation, public fee records.

-- One executed Squads transaction pays several recipients, so payout signatures aren't unique.
alter table payouts drop constraint if exists payouts_tx_signature_key;
create index payouts_tx_signature_idx on payouts (tx_signature);

alter table payouts
  add column squads_transaction_index bigint,
  add column proposal_signature text,
  add column proposed_by uuid references profiles(id),
  add column proposed_at timestamptz,
  add column confirmed_at timestamptz;

-- Planned payouts for a claim can never exceed the claim.
create function guard_payout_total() returns trigger
language plpgsql as $$
declare v_claim numeric; v_total numeric;
begin
  select amount_raw into v_claim from fee_claims where id = new.source_claim_id;
  select coalesce(sum(amount_raw), 0) into v_total from payouts where source_claim_id = new.source_claim_id and id <> new.id;
  if v_total + new.amount_raw > v_claim then
    raise exception 'payouts for claim % would exceed the amount collected', new.source_claim_id using errcode = '22023';
  end if;
  return new;
end $$;
create trigger payouts_total_guard before insert on payouts for each row execute function guard_payout_total();

-- Payout lifecycle: pending → submitted (Squads proposal) → confirmed (executed on-chain). Amounts and recipients are fixed.
create function guard_payout_update() returns trigger
language plpgsql as $$
begin
  if (new.amount_raw, new.recipient, new.recipient_address, new.source_claim_id, new.launch_id)
     is distinct from (old.amount_raw, old.recipient, old.recipient_address, old.source_claim_id, old.launch_id) then
    raise exception 'payout amount and recipient are fixed once planned' using errcode = '42501';
  end if;
  if old.status = 'confirmed' and (new.status, new.tx_signature) is distinct from (old.status, old.tx_signature) then
    raise exception 'confirmed payouts are final' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('pending','submitted'), ('submitted','confirmed'), ('submitted','pending'), ('submitted','failed'), ('pending','failed'), ('failed','pending'))) then
    raise exception 'payout cannot move from % to %', old.status, new.status using errcode = '22023';
  end if;
  if new.status = 'submitted' and new.squads_transaction_index is null then
    raise exception 'a submitted payout must reference its Squads transaction' using errcode = '22023';
  end if;
  if new.status = 'confirmed' and (new.tx_signature is null or new.confirmed_at is null) then
    raise exception 'a confirmed payout needs its on-chain signature' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger payouts_update_guard before update on payouts for each row execute function guard_payout_update();
create trigger payouts_no_delete before delete on payouts for each row execute function forbid_mutation();

-- Per-launch ledger (staff; RLS of the caller applies).
create view fee_ledger with (security_invoker = true) as
select l.id as launch_id, a.id as application_id, a.public_ref, a.project_name, a.ticker,
       coalesce((select sum(amount_raw) from fee_claims c where c.launch_id = l.id), 0) as collected_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id), 0) as planned_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id and p.status = 'confirmed'), 0) as confirmed_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id and p.status in ('pending','submitted')), 0) as outstanding_raw,
       (select count(*) from payouts p where p.launch_id = l.id and p.status = 'failed') as failed_count
from launches l join applications a on a.id = l.application_id
where l.status = 'finalized';

-- Public: every fee collection, with its transaction.
create view public_fee_claims with (security_barrier = true) as
select a.public_ref, c.source, c.amount_raw, c.quote_mint, c.tx_signature, c.slot, c.observed_at
from fee_claims c join launches l on l.id = c.launch_id join applications a on a.id = l.application_id
where a.status = 'launched';

create or replace view public_payouts as
select a.public_ref, p.recipient, p.recipient_address, p.amount_raw, p.status, p.tx_signature, p.updated_at
from payouts p join launches l on l.id = p.launch_id join applications a on a.id = l.application_id
where a.status = 'launched';

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_fee_claims, public_payouts to anon, authenticated';
    execute 'grant select on fee_ledger to authenticated';
  end if;
end $$;

-- ===== 0009_lock_transition_rules.sql =====
-- 0009: status_transition_rules had no RLS. On Supabase, public tables are writable by `authenticated`
-- by default, so a user could have inserted a rule granting themselves approval. Lock it down.
alter table status_transition_rules enable row level security;
create policy rules_read on status_transition_rules for select using (auth.uid() is not null);
-- No insert/update/delete policies: only migrations (table owner) can change the rules.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke insert, update, delete, truncate on status_transition_rules from anon, authenticated';
  end if;
end $$;

-- ===== 0010_harden_functions.sql =====
-- 0010: hardening from the Supabase security advisor.

-- Pin search_path on trigger functions.
alter function block_direct_status_update() set search_path = public;
alter function audit_log_chain() set search_path = public;
alter function forbid_mutation() set search_path = public;
alter function freeze_approved_fee_config() set search_path = public;
alter function freeze_launch_terms() set search_path = public;
alter function guard_launch_status() set search_path = public;
alter function guard_launched_transition() set search_path = public;
alter function guard_payout_total() set search_path = public;
alter function guard_payout_update() set search_path = public;

do $$
declare
  fn text;
begin
  -- Trigger-only functions: nobody calls these over the API.
  foreach fn in array array[
    'audit_row()', 'handle_new_user()', 'handle_user_email_confirmed()'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon, authenticated', fn);
    end if;
  end loop;

  -- Signed-in only (each checks the caller's role internally).
  foreach fn in array array[
    'claim_next_screening(text, text, text)', 'complete_screening(uuid, jsonb)', 'fail_screening(uuid, text)',
    'submit_application(uuid)', 'transition_application(uuid, application_status, text)', 'launch_blockers(uuid)',
    'owns_editable_app(uuid)', 'has_role(app_role)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', fn);
      execute format('grant execute on function %s to authenticated', fn);
    end if;
  end loop;
  -- can_read_app and is_staff stay callable by anon: the milestones read policy uses them.

  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') and exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Wrap launch_blockers with the staff check (same body as 0007, plus the guard).
create or replace function launch_blockers(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_launch launches%rowtype;
  v_fc fee_configs%rowtype;
  out text[] := '{}';
begin
  -- Only staff may see a launch checklist (transition_application calls this for a staff caller).
  if auth.uid() is not null and not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_app from applications where id = p_app;
  select * into v_launch from launches where application_id = p_app;
  if v_launch.id is null then return array['launch configuration has not been created']; end if;
  select * into v_fc from fee_configs where id = v_launch.fee_config_id;
  if v_fc.approved_at is null then out := array_append(out, 'fee split has not been approved'); end if;
  if not exists (select 1 from treasuries where application_id = p_app) then out := array_append(out, 'community treasury is not set'); end if;
  if v_launch.founder_wallet is null then out := array_append(out, 'founder payout wallet is not set'); end if;
  if v_fc.launcher_bps > 0 and v_launch.launcher_wallet is null then out := array_append(out, 'launcher payout wallet is not set'); end if;
  if v_fc.launcher_bps = 0 and v_launch.launcher_wallet is not null then out := array_append(out, 'launcher wallet set but launcher share is 0%'); end if;
  if v_launch.terms_sha256 is null then out := array_append(out, 'launch terms have not been generated'); end if;
  if v_launch.mint_authority_revoked is distinct from true or v_launch.freeze_authority_revoked is distinct from true then
    out := array_append(out, 'mint and freeze authority must both be revoked at launch');
  end if;
  if not exists (select 1 from platform_settings where key = 'fee_router_address') then out := array_append(out, 'Fee Router address is not configured'); end if;
  if not exists (select 1 from agreements where application_id = p_app and signer_role = 'founder'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.founder_wallet) then
    out := array_append(out, 'founder has not signed the current terms with the founder wallet');
  end if;
  if v_fc.launcher_bps > 0 and not exists (select 1 from agreements where application_id = p_app and signer_role = 'launcher'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.launcher_wallet) then
    out := array_append(out, 'launcher has not signed the current terms with the launcher wallet');
  end if;
  if v_app.status = 'ready_for_deployment' and v_launch.status <> 'finalized' then
    out := array_append(out, 'launch transaction has not been verified on-chain');
  end if;
  return out;
end $$;


-- ===== 0011_pgcrypto_search_path.sql =====
-- 0011: on Supabase, pgcrypto (digest) lives in the `extensions` schema.
-- Functions that hash must be able to see it, or signups (audit chain) and screening claims fail.
alter function audit_log_chain() set search_path = public, extensions;
alter function claim_next_screening(text, text, text) set search_path = public, extensions;

-- ===== 0012_wallet_accounts.sql =====
-- 0012: wallet accounts. "Sign in with Web3" (Solana) users have no email; their account is their wallet.

alter table profiles add column if not exists wallet_address text unique
  check (wallet_address is null or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace function wallet_from_meta(m jsonb) returns text
language sql immutable set search_path = public as $$
  select nullif(coalesce(
    m -> 'custom_claims' ->> 'address',
    m ->> 'address',
    substring(m ->> 'sub' from '^web3:solana:(.+)$')
  ), '')
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wallet text := wallet_from_meta(coalesce(new.raw_user_meta_data, '{}'::jsonb));
begin
  if v_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then v_wallet := null; end if;
  insert into profiles (id, display_name, email_verified_at, wallet_address)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                        nullif(split_part(new.email, '@', 1), ''),
                        case when v_wallet is not null then left(v_wallet, 4) || '…' || right(v_wallet, 4) end,
                        'Founder'), 120),
          new.email_confirmed_at,
          v_wallet)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role) values (new.id, 'applicant') on conflict do nothing;
  return new;
end $$;

revoke execute on function handle_new_user() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function handle_new_user() from anon, authenticated';
  end if;
end $$;

-- ===== 0013_pairing.sql =====
-- 0013: "Paired with" — an optional, disclosed link from a project to a related token, project or person.
-- Informational only: on Raydium LaunchLab every token's on-chain quote asset is SOL (Raydium creates the
-- per-quote-token curve configs, not us). The pairing is screened like any other claim and shown publicly
-- with its relationship ("inspired by" vs "official"), so nobody reads it as an endorsement.

create type pair_kind as enum ('token', 'project', 'person');
create type pair_relationship as enum ('inspired_by', 'official');

alter table applications
  add column pair_kind pair_kind,
  add column pair_name text check (pair_name is null or length(trim(pair_name)) between 1 and 80),
  add column pair_url text check (pair_url is null or pair_url ~ '^https://[^\s@/]+(/\S*)?$'),
  add column pair_mint text check (pair_mint is null or pair_mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column pair_reason text check (pair_reason is null or length(pair_reason) between 1 and 600),
  add column pair_relationship pair_relationship,
  add constraint pair_token_needs_mint check (pair_kind is distinct from 'token' or pair_mint is not null);

-- Public projects expose the pairing only when it's complete.
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_kind end as pair_kind,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_name end as pair_name,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_url end as pair_url,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_mint end as pair_mint,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_relationship end as pair_relationship,
       a.created_at
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
  end if;
end $$;

-- ===== 0014_quote_tokens.sql =====
-- 0014: on-chain pairing. A launch's bonding curve is quoted in a token chosen from a staff-managed allowlist.
-- Raydium creates one LaunchLab global config per quote token; a launchpad then allow-lists that config for
-- its own platform (createPlatformAllowConfig). We store both, and only offer tokens that pass both checks.

create table quote_tokens (
  mint                  text primary key check (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  symbol                text not null check (symbol ~ '^[A-Za-z0-9.]{1,12}$'),
  name                  text not null check (length(trim(name)) between 1 and 60),
  decimals              int  not null check (decimals between 0 and 12),
  network               text not null check (network in ('solana-devnet', 'solana-mainnet')),
  launchlab_config_id   text not null check (launchlab_config_id ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  platform_allow_config text check (platform_allow_config ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  platform_allowed_at   timestamptz,
  enabled               boolean not null default false,
  added_by              uuid references profiles(id),
  created_at            timestamptz not null default now(),
  -- SOL is the platform's default config; anything else must be allow-listed on our platform first.
  constraint enabled_needs_allow check (
    not enabled or mint = 'So11111111111111111111111111111111111111112' or platform_allowed_at is not null)
);

alter table quote_tokens enable row level security;
create policy quote_tokens_read  on quote_tokens for select using (enabled or is_staff());
create policy quote_tokens_staff on quote_tokens for all using (is_staff()) with check (is_staff());
create trigger audit_quote_tokens after insert or update or delete on quote_tokens for each row execute function audit_row();

insert into quote_tokens (mint, symbol, name, decimals, network, launchlab_config_id, enabled)
values ('So11111111111111111111111111111111111111112', 'SOL', 'Solana', 9, 'solana-devnet',
        '7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt', true);

alter table applications add column quote_mint text references quote_tokens(mint);
alter table launches     add column quote_mint text references quote_tokens(mint);

-- Public directory: show what each project is paired with on-chain.
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_kind end as pair_kind,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_name end as pair_name,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_url end as pair_url,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_mint end as pair_mint,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_relationship end as pair_relationship,
       a.created_at,
       coalesce(l.quote_mint, a.quote_mint, 'So11111111111111111111111111111111111111112') as quote_mint,
       coalesce(q.symbol, 'SOL') as quote_symbol
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
left join quote_tokens q on q.mint = coalesce(l.quote_mint, a.quote_mint)
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
    execute 'grant select on quote_tokens to anon, authenticated';
  end if;
end $$;

-- Launch readiness: quote token must be enabled and match the application.
create or replace function launch_blockers(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_launch launches%rowtype;
  v_fc fee_configs%rowtype;
  out text[] := '{}';
begin
  -- Only staff may see a launch checklist (transition_application calls this for a staff caller).
  if auth.uid() is not null and not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_app from applications where id = p_app;
  select * into v_launch from launches where application_id = p_app;
  if v_launch.id is null then return array['launch configuration has not been created']; end if;
  select * into v_fc from fee_configs where id = v_launch.fee_config_id;
  if v_fc.approved_at is null then out := array_append(out, 'fee split has not been approved'); end if;
  if not exists (select 1 from treasuries where application_id = p_app) then out := array_append(out, 'community treasury is not set'); end if;
  if v_launch.founder_wallet is null then out := array_append(out, 'founder payout wallet is not set'); end if;
  if v_fc.launcher_bps > 0 and v_launch.launcher_wallet is null then out := array_append(out, 'launcher payout wallet is not set'); end if;
  if v_fc.launcher_bps = 0 and v_launch.launcher_wallet is not null then out := array_append(out, 'launcher wallet set but launcher share is 0%'); end if;
  if v_launch.terms_sha256 is null then out := array_append(out, 'launch terms have not been generated'); end if;
  if v_launch.mint_authority_revoked is distinct from true or v_launch.freeze_authority_revoked is distinct from true then
    out := array_append(out, 'mint and freeze authority must both be revoked at launch');
  end if;
  if not exists (select 1 from platform_settings where key = 'fee_router_address') then out := array_append(out, 'Fee Router address is not configured'); end if;
  if not exists (select 1 from agreements where application_id = p_app and signer_role = 'founder'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.founder_wallet) then
    out := array_append(out, 'founder has not signed the current terms with the founder wallet');
  end if;
  if v_fc.launcher_bps > 0 and not exists (select 1 from agreements where application_id = p_app and signer_role = 'launcher'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.launcher_wallet) then
    out := array_append(out, 'launcher has not signed the current terms with the launcher wallet');
  end if;
  if not exists (select 1 from quote_tokens
                 where mint = coalesce(v_launch.quote_mint, v_app.quote_mint, 'So11111111111111111111111111111111111111112') and enabled) then
    out := array_append(out, 'the quote token is not enabled on the platform');
  end if;
  if coalesce(v_launch.quote_mint, v_app.quote_mint, 'So11111111111111111111111111111111111111112') is distinct from coalesce(v_app.quote_mint, 'So11111111111111111111111111111111111111112') then
    out := array_append(out, 'launch quote token does not match the application');
  end if;
  if v_app.status = 'ready_for_deployment' and v_launch.status <> 'finalized' then
    out := array_append(out, 'launch transaction has not been verified on-chain');
  end if;
  return out;
end $$;

-- ===== 0015_simple_apply.sql =====
-- Simpler application: name, ticker, description, links, proof, image. Then fees. Then an optional starter's buy.

-- Project image: public, because it becomes the coin's image. Path is server-generated.
alter table applications
  add column image_path text check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|gif)$'),
  -- Starter's buy: what the launcher says they'll buy right after launch, in the pair token. 0 = none. Disclosed publicly.
  add column starter_buy_amount numeric(20, 9) not null default 0 check (starter_buy_amount >= 0 and starter_buy_amount <= 25);

alter table launches
  add column starter_buy_amount numeric(20, 9) not null default 0 check (starter_buy_amount >= 0 and starter_buy_amount <= 25),
  add column starter_buy_tx text check (starter_buy_tx ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$'),
  add column starter_buy_at timestamptz;

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('project-images', 'project-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    on conflict (id) do nothing;
    execute $p$create policy project_image_owner_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'project-images' and (storage.foldername(name))[1] = auth.uid()::text
                  and public.owns_editable_app(((storage.foldername(name))[2])::uuid))$p$;
  end if;
end $$;

-- Submitting needs: at least one official link, proof the builder is in, and an image.
create or replace function submit_application(p_app uuid) returns application_status
language plpgsql security definer set search_path = public as $$
declare v_status application_status;
begin
  select status into v_status from applications where id = p_app and applicant_id = auth.uid();
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from application_links where application_id = p_app and kind in ('website', 'x', 'github')) then
    raise exception 'add the project''s website, X or GitHub' using errcode = '22023';
  end if;
  if not exists (select 1 from evidence_files where application_id = p_app and kind in ('authorization', 'founder_approval'))
     and not exists (select 1 from applications where id = p_app and coalesce(trim(founder_approval_statement), '') <> '') then
    raise exception 'upload proof the builder approved this launch' using errcode = '22023';
  end if;
  if not exists (select 1 from applications where id = p_app and image_path is not null) then
    raise exception 'add an image for the coin' using errcode = '22023';
  end if;
  return transition_application(p_app, 'submitted', null);
end $$;

-- Public directory: add the image and the disclosed starter's buy.
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_kind end as pair_kind,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_name end as pair_name,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_url end as pair_url,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_mint end as pair_mint,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_relationship end as pair_relationship,
       a.created_at,
       coalesce(l.quote_mint, a.quote_mint, 'So11111111111111111111111111111111111111112') as quote_mint,
       coalesce(q.symbol, 'SOL') as quote_symbol,
       a.image_path,
       coalesce(l.starter_buy_amount, a.starter_buy_amount) as starter_buy_amount,
       l.starter_buy_tx
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
left join quote_tokens q on q.mint = coalesce(l.quote_mint, a.quote_mint)
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
  end if;
end $$;

-- The starter's buy is part of the signed terms, so it freezes with them. Its transaction is recorded once,
-- only after the launch is finalized.
create or replace function freeze_launch_terms() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select status from applications where id = old.application_id) in ('ready_for_deployment', 'launched')
     and (new.terms_sha256, new.founder_wallet, new.launcher_wallet, new.fee_config_id, new.total_supply_raw, new.decimals,
          new.mint_authority_revoked, new.freeze_authority_revoked, new.insider_allocations, new.network, new.starter_buy_amount)
         is distinct from
         (old.terms_sha256, old.founder_wallet, old.launcher_wallet, old.fee_config_id, old.total_supply_raw, old.decimals,
          old.mint_authority_revoked, old.freeze_authority_revoked, old.insider_allocations, old.network, old.starter_buy_amount) then
    raise exception 'launch terms are frozen once ready for deployment' using errcode = '42501';
  end if;
  if new.starter_buy_tx is distinct from old.starter_buy_tx then
    if old.starter_buy_tx is not null then
      raise exception 'the starter''s buy is already recorded' using errcode = '42501';
    end if;
    if new.status <> 'finalized' or new.starter_buy_amount <= 0 then
      raise exception 'a starter''s buy is recorded only after a finalized launch that disclosed one' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- ===== 0016_terms_and_pairs.sql =====
-- Terms of Use acceptance (append-only) and the pair catalog discovered from Raydium LaunchLab.

create table terms_acceptances (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  version     text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  wallet      text check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  user_agent  text check (length(user_agent) <= 512),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);
alter table terms_acceptances enable row level security;
create policy terms_insert_own on terms_acceptances for insert to authenticated with check (user_id = auth.uid());
create policy terms_read_own on terms_acceptances for select to authenticated using (user_id = auth.uid() or is_staff());
-- No update or delete policy: an acceptance is a record, not a setting.

-- Pair catalog: every quote mint Raydium has a LaunchLab config for. `listed` = offered to applicants;
-- `enabled` still means allow-listed on our platform (needed at launch time).
alter table quote_tokens
  add column category text not null default 'custom' check (category in ('xstocks', 'prestocks', 'currencies', 'solana', 'majors', 'custom')),
  add column logo_url text check (logo_url ~ '^https://' and length(logo_url) <= 1024),
  add column token_program text check (token_program ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column listed boolean not null default false,
  add column synced_at timestamptz;

update quote_tokens set listed = true, category = 'solana' where mint = 'So11111111111111111111111111111111111111112';

drop policy if exists quote_tokens_read on quote_tokens;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where tablename = 'quote_tokens' and cmd = 'SELECT' loop
    execute format('drop policy %I on quote_tokens', p.policyname);
  end loop;
end $$;
create policy quote_tokens_read on quote_tokens for select using (enabled or listed or is_staff());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert on terms_acceptances to authenticated';
    execute 'grant usage on sequence terms_acceptances_id_seq to authenticated';
  end if;
end $$;
