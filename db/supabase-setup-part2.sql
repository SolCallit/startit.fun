-- Startit setup PART 2 (migrations 0005–0009). Run AFTER 0001–0004 are applied.
-- Supabase may warn this contains destructive operations: that's expected (it swaps the 3-way fee rules for 4-way). Confirm and run.

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

