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
