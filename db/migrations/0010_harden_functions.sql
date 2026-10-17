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

