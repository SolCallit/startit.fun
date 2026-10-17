-- Payout guards (0008). Uses the launched ORBT fixture from 0004/0005.
\set ON_ERROR_STOP on
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

insert into fee_claims (id, launch_id, source, amount_raw, quote_mint, tx_signature, slot)
values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000b001', 'platform_fee', 1000, 'So11111111111111111111111111111111111111112', 'claimsig1', 10);

insert into payouts (id, launch_id, source_claim_id, recipient, recipient_address, amount_raw) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'community', 'C', 500),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'founder',   'F', 300),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'launcher',  'L', 50),
  ('00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'platform',  'P', 150);

select pg_temp.expect_fail($$insert into payouts (launch_id, source_claim_id, recipient, recipient_address, amount_raw)
  values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000c001', 'platform', 'P2', 1)$$, 'payouts cannot exceed the claim');
select pg_temp.expect_fail($$update payouts set recipient_address = 'Attacker' where id = '00000000-0000-0000-0000-00000000d001'$$, 'payout recipient is fixed');
select pg_temp.expect_fail($$update payouts set status = 'confirmed' where id = '00000000-0000-0000-0000-00000000d001'$$, 'cannot confirm without going through a proposal');
select pg_temp.expect_fail($$update payouts set status = 'submitted' where id = '00000000-0000-0000-0000-00000000d001'$$, 'submitted needs a Squads transaction index');

update payouts set status = 'submitted', squads_transaction_index = 7 where launch_id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.expect_fail($$update payouts set status = 'confirmed' where id = '00000000-0000-0000-0000-00000000d001'$$, 'confirmed needs the on-chain signature');
update payouts set status = 'confirmed', tx_signature = 'paysig1', confirmed_at = now() where launch_id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.expect_fail($$update payouts set status = 'pending' where id = '00000000-0000-0000-0000-00000000d001'$$, 'confirmed payouts are final');
select pg_temp.expect_fail($$delete from payouts where id = '00000000-0000-0000-0000-00000000d001'$$, 'payouts cannot be deleted');

do $$ declare r record; begin
  select * into r from fee_ledger where launch_id = '00000000-0000-0000-0000-00000000b001';
  if r.collected_raw <> 1000 or r.planned_raw <> 1000 or r.confirmed_raw <> 1000 then raise exception 'FAIL  ledger totals wrong: %', r; end if;
  if (select count(*) from public_payouts where tx_signature = 'paysig1') <> 4 then raise exception 'FAIL  four payouts should share one public signature'; end if;
  if (select count(*) from public_fee_claims where tx_signature = 'claimsig1') <> 1 then raise exception 'FAIL  claim should be public'; end if;
  raise notice 'PASS  ledger balances; claims and 4-way payouts are public with signatures';
end $$;
\echo ALL PAYOUT TESTS PASSED
