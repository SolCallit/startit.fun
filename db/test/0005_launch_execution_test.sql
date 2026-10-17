-- Launch execution guards (0007). Continues from the ORBT fixture in 0004.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');

select pg_temp.expect_fail($$select transition_application('00000000-0000-0000-0000-00000000a001', 'launched', null)$$,
  'cannot mark launched without a verified launch');

select pg_temp.expect_fail($$update launches set status = 'submitted' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'cannot skip preview and confirmation');

select pg_temp.expect_fail($$update launches set operator_confirmed_at = now(), operator_confirmed_by = '00000000-0000-0000-0000-00000000000c'
  where id = '00000000-0000-0000-0000-00000000b001'$$, 'operator cannot confirm before a preview exists');

update launches set status = 'previewed', preview_message_sha256 = repeat('c', 64), previewed_at = now(),
  tx_preview = '{"programs":["DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6"]}' where id = '00000000-0000-0000-0000-00000000b001';

-- founder_confirmed_at was not set in fixture → confirmation blocked
select pg_temp.expect_fail($$update launches set status = 'operator_confirmed', operator_confirmed_at = now(),
  operator_confirmed_by = '00000000-0000-0000-0000-00000000000c' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'operator cannot confirm before the founder has confirmed');

update launches set founder_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000b001';
update launches set status = 'operator_confirmed', operator_confirmed_at = now(), operator_confirmed_by = '00000000-0000-0000-0000-00000000000c'
  where id = '00000000-0000-0000-0000-00000000b001';
update launches set status = 'submitted', tx_signature = 'sig1', submitted_at = now() where id = '00000000-0000-0000-0000-00000000b001';

select pg_temp.expect_fail($$update launches set tx_signature = 'sig2' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'submitted signature is immutable');
select pg_temp.expect_fail($$update launches set status = 'finalized' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'cannot finalize without on-chain verification');
select pg_temp.expect_fail($$update launches set status = 'finalized', verified_at = now(), verified_freeze_authority = 'SomeOne111'
  where id = '00000000-0000-0000-0000-00000000b001'$$, 'cannot finalize if someone holds freeze authority');

update launches set status = 'finalized', verified_at = now(), verified_freeze_authority = null, verified_mint_authority = null,
  mint_address = 'MintAddr1111111111111111111111111111111111', verified_supply_raw = 1000000000000000
  where id = '00000000-0000-0000-0000-00000000b001';
select transition_application('00000000-0000-0000-0000-00000000a001', 'launched', null);

do $$ begin
  if (select status from applications where id = '00000000-0000-0000-0000-00000000a001') <> 'launched' then
    raise exception 'FAIL  verified launch should allow launched';
  end if;
  raise notice 'PASS  launched only after preview → founder + operator confirmation → submit → on-chain verification';
end $$;
reset role;
\echo ALL LAUNCH EXECUTION TESTS PASSED
select pg_temp.expect_fail($$update launches set mint_address = 'Other1111111111111111111111111111111111111' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'finalized launch record is immutable');
