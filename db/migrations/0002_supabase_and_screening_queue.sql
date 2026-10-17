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
