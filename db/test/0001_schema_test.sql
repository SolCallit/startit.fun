-- Schema invariant tests. Run after bootstrap_local.sql + migrations. Any failure aborts with ERROR.
\set ON_ERROR_STOP on
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

-- Fixture users (as superuser)
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- applicant
  ('00000000-0000-0000-0000-00000000000b'),  -- other applicant
  ('00000000-0000-0000-0000-00000000000c'),  -- operator
  ('00000000-0000-0000-0000-00000000000d');  -- screening service
-- Profiles + applicant role are created by the on_auth_user_created trigger (0002).
insert into user_roles (user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'applicant'),
  ('00000000-0000-0000-0000-00000000000b', 'applicant'),
  ('00000000-0000-0000-0000-00000000000c', 'operator'),
  ('00000000-0000-0000-0000-00000000000d', 'screening_service')
on conflict do nothing;

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
end $$;

create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'PASS  %  (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

set role authenticated;

-- 1. Applicant creates and submits a draft.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
with ins as (
  insert into applications (applicant_id, project_name, project_summary, token_name, ticker, token_concept,
                            disclosures_acknowledged_at)
  values ('00000000-0000-0000-0000-00000000000a', 'NeuroForge', 'Open-source eval harness', 'Forge', 'FORGE',
          'Community token for the NeuroForge builders', now())
  returning id)
insert into t_ids select 'app', id from ins;

select pg_temp.expect_fail(
  $$update applications set status = 'approved' where id = (select v from t_ids where k='app')$$,
  'direct status UPDATE is blocked');

select pg_temp.expect_fail(
  $$select transition_application((select v from t_ids where k='app'), 'approved')$$,
  'applicant cannot self-approve');

select transition_application((select v from t_ids where k='app'), 'submitted');

-- 2. Other applicant cannot see it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if (select count(*) from applications) <> 0 then raise exception 'FAIL  RLS leak to other applicant'; end if;
  raise notice 'PASS  other applicant sees 0 applications';
end $$;

-- 3. Duplicate live ticker rejected.
select pg_temp.expect_fail(
  $$insert into applications (applicant_id, project_name, project_summary, token_name, ticker, token_concept,
       disclosures_acknowledged_at, submitted_at, status)
    values ('00000000-0000-0000-0000-00000000000b','Copy','x','Forge','FORGE','x',now(),now(),'draft');
    select transition_application((select id from applications where project_name='Copy'), 'submitted')$$,
  'duplicate live ticker blocked');

-- 4. Screening service moves it through screening; cannot approve.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select transition_application((select v from t_ids where k='app'), 'ai_screening');
select pg_temp.expect_fail(
  $$select transition_application((select v from t_ids where k='app'), 'approved')$$,
  'AI service cannot approve');
select transition_application((select v from t_ids where k='app'), 'awaiting_review');

-- 5. Applicant cannot read internal notes / AI findings.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into operator_notes (application_id, author_id, body)
values ((select v from t_ids where k='app'), '00000000-0000-0000-0000-00000000000c', 'internal: check founder X handle');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from operator_notes) <> 0 then raise exception 'FAIL  applicant can read operator notes'; end if;
  raise notice 'PASS  applicant sees 0 operator notes';
end $$;

-- 6. Rejection requires a reason; operator approves with history recorded.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_fail(
  $$select transition_application((select v from t_ids where k='app'), 'rejected')$$,
  'reject without reason blocked');
select transition_application((select v from t_ids where k='app'), 'approved', 'Founder authorization verified on call');

-- 7. Fee allocation rules.
select pg_temp.expect_fail(
  $$insert into fee_configs (application_id, platform_bps, founder_bps, community_bps)
    values ((select v from t_ids where k='app'), 2000, 3000, 4000)$$,
  'fees not summing to 100% blocked');
select pg_temp.expect_fail(
  $$insert into fee_configs (application_id, platform_bps, founder_bps, community_bps)
    values ((select v from t_ids where k='app'), 1500, 3500, 5000)$$,
  'non-default split without reason blocked');

with ins as (
  insert into fee_configs (application_id, platform_bps, founder_bps, community_bps, approved_by, approved_at)
  values ((select v from t_ids where k='app'), 2000, 3000, 5000, '00000000-0000-0000-0000-00000000000c', now())
  returning id)
insert into t_ids select 'fee', id from ins;

select pg_temp.expect_fail(
  $$update fee_configs set founder_bps = 4000, community_bps = 4000 where id = (select v from t_ids where k='fee')$$,
  'approved fee config is immutable');

-- 8. Launch cannot be submitted without both confirmations and a preview.
select pg_temp.expect_fail(
  $$insert into launches (application_id, fee_config_id, status)
    values ((select v from t_ids where k='app'), (select v from t_ids where k='fee'), 'submitted')$$,
  'launch submit without confirmations blocked');

-- 9. Audit log and decision history are append-only.
reset role;
select pg_temp.expect_fail($$delete from status_transitions$$, 'status history is immutable');
select pg_temp.expect_fail($$update audit_log set action = 'x'$$, 'audit log is immutable');

do $$ declare n int; broken int; begin
  select count(*) into n from status_transitions;
  if n <> 4 then raise exception 'FAIL  expected 4 transitions, got %', n; end if;
  select count(*) into broken from (
    select prev_hash, lag(row_hash) over (order by id) as expected from audit_log) x
    where x.prev_hash is distinct from x.expected;
  if broken <> 0 then raise exception 'FAIL  audit hash chain broken'; end if;
  raise notice 'PASS  % transitions recorded, audit chain intact', n;
end $$;

\echo ALL SCHEMA TESTS PASSED
