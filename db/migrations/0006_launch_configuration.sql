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
