-- Four-way split invariants (0005).
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'scout@example.com');

do $$ begin
  insert into applications (applicant_id, project_name) values ('00000000-0000-0000-0000-0000000000f1', 'ScoutCo');
  if (select row(proposed_platform_bps, proposed_founder_bps, proposed_launcher_bps, proposed_community_bps)::text
      from applications where project_name = 'ScoutCo') <> '(1500,3000,500,5000)' then
    raise exception 'FAIL  new application should default to 15/30/5/50';
  end if;
  raise notice 'PASS  new applications default to 15/30/5/50';
end $$;

select pg_temp.expect_fail($$update applications set applicant_is_founder = true where project_name = 'ScoutCo'$$,
  'self-launch with a launcher share is blocked');

update applications set applicant_is_founder = true, proposed_platform_bps = 2000, proposed_launcher_bps = 0 where project_name = 'ScoutCo';

select pg_temp.expect_fail($$insert into fee_configs (application_id, platform_bps, founder_bps, launcher_bps, community_bps)
  select id, 1500, 3000, 500, 4000 from applications where project_name = 'ScoutCo'$$, '4-way split not totalling 100% blocked');

insert into fee_configs (application_id, platform_bps, founder_bps, launcher_bps, community_bps)
  select id, 1500, 3000, 500, 5000 from applications where project_name = 'ScoutCo';
insert into fee_configs (application_id, platform_bps, founder_bps, launcher_bps, community_bps)
  select id, 2000, 3000, 0, 5000 from applications where project_name = 'ScoutCo';
do $$ begin
  if (select count(*) from fee_configs where is_default and application_id = (select id from applications where project_name = 'ScoutCo')) <> 2 then
    raise exception 'FAIL  both default splits should be recognised';
  end if;
  raise notice 'PASS  15/30/5/50 and 20/30/0/50 are both defaults; no reason needed';
end $$;

select pg_temp.expect_fail($$insert into fee_configs (application_id, platform_bps, founder_bps, launcher_bps, community_bps)
  select id, 1000, 3000, 1000, 5000 from applications where project_name = 'ScoutCo'$$, 'non-default 4-way split needs a reason');

with fc as (
  insert into fee_configs (application_id, platform_bps, founder_bps, launcher_bps, community_bps, approved_at)
  select id, 1500, 3000, 500, 5000, now() from applications where project_name = 'ScoutCo' returning id)
select pg_temp.expect_fail(format($$update fee_configs set launcher_bps = 1000, platform_bps = 1000 where id = %L$$, (select id from fc)),
  'approved launcher share is immutable');

\echo ALL FEE SPLIT TESTS PASSED
