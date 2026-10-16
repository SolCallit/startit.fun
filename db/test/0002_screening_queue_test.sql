-- Screening queue + submission invariants. Runs after 0001 test in the same database.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'founder2@example.com', '{"display_name":"Ada"}');

do $$ begin
  if (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000e1') <> 'Ada' then
    raise exception 'FAIL  signup trigger did not create profile';
  end if;
  if not exists (select 1 from user_roles where user_id = '00000000-0000-0000-0000-0000000000e1' and role = 'applicant') then
    raise exception 'FAIL  signup trigger did not grant applicant role';
  end if;
  raise notice 'PASS  signup creates profile + applicant role';
end $$;

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

create temp table t2 (k text primary key, v uuid);
grant all on t2 to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');

with ins as (
  insert into applications (applicant_id, project_name, project_summary, token_name, ticker, token_concept,
                            disclosures_acknowledged_at)
  values ('00000000-0000-0000-0000-0000000000e1', 'Lattice', 'Vector DB for agents', 'Lattice', 'LATT',
          'Community token', now())
  returning id)
insert into t2 select 'app', id from ins;

select pg_temp.expect_fail($$select submit_application((select v from t2 where k='app'))$$,
  'submit without website blocked');

insert into application_links (application_id, kind, url)
values ((select v from t2 where k='app'), 'website', 'https://lattice.example.com');

select pg_temp.expect_fail($$select submit_application((select v from t2 where k='app'))$$,
  'submit without founder approval blocked');

update applications set founder_approval_statement = 'I, Ada, approve the $LATT launch.' where id = (select v from t2 where k='app');
select submit_application((select v from t2 where k='app'));

select pg_temp.expect_fail($$select * from claim_next_screening('anthropic','m','v1')$$,
  'applicant cannot claim screening jobs');

-- Screening service claims and completes.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into t2 select 'run', run_id from claim_next_screening('anthropic', 'test-model', 'v1');

do $$ begin
  if (select status from applications where id = (select v from t2 where k='app')) <> 'ai_screening' then
    raise exception 'FAIL  claim did not move app to ai_screening';
  end if;
  if (select count(*) from claim_next_screening('anthropic', 'm', 'v1')) <> 0 then
    raise exception 'FAIL  same app claimed twice';
  end if;
  raise notice 'PASS  claim moves app to ai_screening and is exclusive';
end $$;

select complete_screening((select v from t2 where k='run'), $j${
  "recommendation": "proceed_to_human_review",
  "confidence": 0.62,
  "summary": "Website and repo match.",
  "limitations": "Could not verify founder identity from public sources.",
  "next_steps": ["Verify founder on a video call"],
  "findings": [
    {"category": "website", "claim": "Official site is lattice.example.com", "status": "VERIFIED",
     "detail": "Site links to GitHub org.", "severity": 1,
     "sources": [{"url": "https://lattice.example.com", "fetched_at": "2026-10-16T12:00:00Z", "http_status": 200}]},
    {"category": "identity", "claim": "Applicant is the founder", "status": "NEEDS_REVIEW",
     "detail": "No public statement found.", "severity": 3, "sources": []}
  ]}$j$::jsonb);

reset role;  -- verify as table owner; the service account itself can't read findings back (RLS)
do $$ begin
  if (select status from applications where id = (select v from t2 where k='app')) <> 'awaiting_review' then
    raise exception 'FAIL  completion did not hand off to human review';
  end if;
  if (select count(*) from screening_findings f join screening_runs r on r.id = f.run_id
      where r.application_id = (select v from t2 where k='app')) <> 2 then
    raise exception 'FAIL  findings not stored';
  end if;
  raise notice 'PASS  completed screening stores findings and stops at awaiting_review';
end $$;
set role authenticated;

select pg_temp.expect_fail($$select transition_application((select v from t2 where k='app'), 'approved', 'x')$$,
  'screening service still cannot approve');

-- Applicant cannot read findings.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$ begin
  if (select count(*) from screening_findings) <> 0 or (select count(*) from screening_reports) <> 0 then
    raise exception 'FAIL  applicant can read AI findings';
  end if;
  raise notice 'PASS  applicant cannot read AI findings or reports';
end $$;

-- Failure path: operator re-runs, worker fails 3 times, app returns to human review.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select transition_application((select v from t2 where k='app'), 'ai_screening', null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ declare r uuid; i int; begin
  for i in 1..3 loop
    select run_id into r from claim_next_screening('anthropic', 'm', 'v1');
    if r is null then raise exception 'FAIL  retry %: nothing claimable', i; end if;
    perform fail_screening(r, 'provider timeout');
  end loop;
  if (select status from applications where id = (select v from t2 where k='app')) <> 'awaiting_review' then
    raise exception 'FAIL  3 failures did not escalate to human review';
  end if;
  raise notice 'PASS  3 failed runs escalate to human review';
end $$;

reset role;
\echo ALL SCREENING QUEUE TESTS PASSED
