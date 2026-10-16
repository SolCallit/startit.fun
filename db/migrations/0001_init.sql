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
  dbc_config_address       text,
  pool_address             text,
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
  claimer        text not null check (claimer in ('partner', 'creator')),
  amount_raw     numeric(39,0) not null check (amount_raw >= 0),
  quote_mint     text not null,
  tx_signature   text not null,
  slot           bigint not null,
  observed_at    timestamptz not null default now(),
  unique (tx_signature, launch_id, claimer)
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
       l.network, l.mint_address, l.pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
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
