create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000016a1', 't1@example.com'), ('00000000-0000-0000-0000-0000000016a2', 't2@example.com');
grant select, insert, update, delete on terms_acceptances to authenticated;
grant usage on all sequences in schema public to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000016a1');
insert into terms_acceptances (user_id, version) values ('00000000-0000-0000-0000-0000000016a1', '2026-10-17');
select pg_temp.expect_fail($$insert into terms_acceptances (user_id, version) values ('00000000-0000-0000-0000-0000000016a2', '2026-10-17')$$,
  'cannot accept terms for someone else');
select pg_temp.expect_fail($$insert into terms_acceptances (user_id, version) values ('00000000-0000-0000-0000-0000000016a1', '2026-10-17')$$,
  'one acceptance per version');
update terms_acceptances set version = '2020-01-01' where user_id = '00000000-0000-0000-0000-0000000016a1';
delete from terms_acceptances where user_id = '00000000-0000-0000-0000-0000000016a1';
do $$ begin
  assert (select count(*) from terms_acceptances where version = '2026-10-17') = 1, 'acceptance cannot be edited or deleted';
  raise notice 'PASS  acceptances are append-only';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000016a2');
do $$ begin
  assert (select count(*) from terms_acceptances) = 0, 'other users cannot read acceptances';
  raise notice 'PASS  acceptances are private';
end $$;
reset role;

-- Listed pairs are readable; unlisted, disabled ones are not.
insert into quote_tokens (mint, symbol, name, decimals, network, launchlab_config_id, listed, category)
values ('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 'SPYx', 'SP500 xStock', 8, 'solana-devnet', '7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt', true, 'xstocks'),
       ('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'JUP', 'Jupiter', 6, 'solana-devnet', '7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt', false, 'majors');
grant select on quote_tokens to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000016a2');
do $$ begin
  assert exists (select 1 from quote_tokens where symbol = 'SPYx'), 'listed pair visible';
  assert not exists (select 1 from quote_tokens where symbol = 'JUP'), 'unlisted pair hidden';
  raise notice 'PASS  applicants see listed pairs only';
end $$;
select pg_temp.expect_fail($$insert into quote_tokens (mint, symbol, name, decimals, network, launchlab_config_id, category) values ('So11111111111111111111111111111111111111113','X','X',6,'solana-devnet','7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt','nope')$$,
  'applicants cannot add pairs');
reset role;

do $$ begin
  assert exists (select 1 from status_transition_rules where from_status = 'submitted' and to_status = 'awaiting_review' and actor = 'admin'), 'admin manual review rule';
  assert not exists (select 1 from status_transition_rules where from_status = 'submitted' and to_status = 'awaiting_review' and actor = 'operator'), 'operators cannot skip screening';
  raise notice 'PASS  only admins can skip AI screening';
end $$;
