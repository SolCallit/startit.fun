\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select pg_temp.expect_fail($$insert into status_transition_rules values ('awaiting_review', 'approved', 'applicant')$$,
  'applicants cannot add transition rules');
delete from status_transition_rules;  -- RLS: matches 0 rows
reset role;
do $$ begin
  if (select count(*) from status_transition_rules) = 0 then raise exception 'FAIL  rules were deleted'; end if;
  raise notice 'PASS  transition rules cannot be changed by users';
end $$;

-- 0010: applicants can't read another project's launch checklist
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select pg_temp.expect_fail($$select launch_blockers('00000000-0000-0000-0000-00000000a001')$$, 'applicants cannot call launch_blockers');
reset role;
