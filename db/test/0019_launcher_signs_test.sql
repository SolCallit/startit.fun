-- Launcher-signed launch (0019): new status moves, and the applicant rule still needs an on-chain-verified launch.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

create temp table gl (id int primary key, status launch_status, tx_signature text, mint_address text, verified_at timestamptz,
  verified_mint_authority text, verified_freeze_authority text, verified_supply_raw numeric);
create trigger gl_guard before update on gl for each row execute function guard_launch_status();
insert into gl (id, status) values (1, 'planned'), (2, 'failed'), (3, 'planned');

update gl set status = 'operator_confirmed' where id = 1;
update gl set status = 'operator_confirmed' where id = 2;
select pg_temp.expect_fail($$update gl set status = 'submitted' where id = 3$$, 'cannot skip the admin approval');
update gl set status = 'submitted', tx_signature = 's1' where id = 1;
select pg_temp.expect_fail($$update gl set tx_signature = 's2' where id = 1$$, 'sent signature stays immutable');
update gl set status = 'failed' where id = 1;
update gl set status = 'operator_confirmed', tx_signature = 's3' where id = 1;

do $$ begin
  if not exists (select 1 from status_transition_rules where from_status = 'ready_for_deployment' and to_status = 'launched' and actor = 'applicant') then
    raise exception 'FAIL  applicant launch rule missing';
  end if;
  raise notice 'PASS  approve → launcher sends → expired/failed retries under the same approval';
end $$;
\echo ALL LAUNCHER-SIGNED TESTS PASSED
