-- Launch configuration + readiness gate (0006).
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

-- Fixtures as owner: a scout's approved application.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'scout2@example.com');
insert into applications (id, applicant_id, status, project_name, project_summary, token_name, ticker, token_concept,
                          disclosures_acknowledged_at, submitted_at, applicant_is_founder)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a7', 'approved', 'Orbit', 's', 'Orbit', 'ORBT', 'c',
        now(), now(), false);

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- operator
select transition_application('00000000-0000-0000-0000-00000000a001', 'launch_config_pending', null);

select pg_temp.expect_fail($$select transition_application('00000000-0000-0000-0000-00000000a001', 'ready_for_deployment', null)$$,
  'cannot be ready with no launch configuration');

insert into fee_configs (id, application_id, platform_bps, founder_bps, launcher_bps, community_bps, approved_by, approved_at)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000a001', 1500, 3000, 500, 5000,
        '00000000-0000-0000-0000-00000000000c', now());
insert into launches (id, application_id, fee_config_id, network, total_supply_raw, decimals, mint_authority_revoked, freeze_authority_revoked,
                      founder_wallet, launcher_wallet, terms_text, terms_sha256)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000f001',
        'solana-devnet', 1000000000000000, 6, true, true,
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        'terms v1', repeat('a', 64));
insert into treasuries (application_id, address, is_multisig, threshold, signers, control_rules)
values ('00000000-0000-0000-0000-00000000a001', 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH', true, 2,
        array['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU','9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM','HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'],
        '2 of 3 signers for any spend');

do $$ declare b text[]; begin
  b := launch_blockers('00000000-0000-0000-0000-00000000a001');
  if not (b @> array['Fee Router address is not configured',
                     'founder has not signed the current terms with the founder wallet',
                     'launcher has not signed the current terms with the launcher wallet']) then
    raise exception 'FAIL  expected router + both signatures as blockers, got %', b;
  end if;
  raise notice 'PASS  blockers list router and both missing signatures';
end $$;

-- Operator can't configure platform settings (admin only).
select pg_temp.expect_fail($$insert into platform_settings (key, value) values ('fee_router_address', 'x')$$, 'operator cannot set platform settings');
reset role;
insert into platform_settings (key, value) values ('fee_router_address', 'FeeRouterMu1tisig1111111111111111111111111');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');

-- Founder signs the CURRENT terms with the right wallet; launcher signs OLD terms → still blocked.
insert into agreements (application_id, kind, version, document_sha256, signer_role, signer_wallet, wallet_signature, signed_at, signed_message)
values ('00000000-0000-0000-0000-00000000a001', 'founder_agreement', 'v1', repeat('a', 64), 'founder',
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'sig', now(), 'msg'),
       ('00000000-0000-0000-0000-00000000a001', 'launcher_agreement', 'v0', repeat('b', 64), 'launcher',
        '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'sig', now(), 'msg');

select pg_temp.expect_fail($$select transition_application('00000000-0000-0000-0000-00000000a001', 'ready_for_deployment', null)$$,
  'signature over stale terms does not count');

insert into agreements (application_id, kind, version, document_sha256, signer_role, signer_wallet, wallet_signature, signed_at, signed_message)
values ('00000000-0000-0000-0000-00000000a001', 'launcher_agreement', 'v1', repeat('a', 64), 'launcher',
        '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'sig', now(), 'msg');

select transition_application('00000000-0000-0000-0000-00000000a001', 'ready_for_deployment', null);

do $$ begin
  if (select disclosed_at from fee_configs where id = '00000000-0000-0000-0000-00000000f001') is null then
    raise exception 'FAIL  becoming ready should publish the fee split';
  end if;
  raise notice 'PASS  ready_for_deployment requires every signature and publishes the split';
end $$;

select pg_temp.expect_fail($$update launches set founder_wallet = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' where id = '00000000-0000-0000-0000-00000000b001'$$,
  'payout wallets frozen once ready');

-- Applicant (scout) can't see signing tokens table rows for others, and can't read platform settings.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
do $$ begin
  if (select count(*) from platform_settings) <> 0 then raise exception 'FAIL  applicant can read platform settings'; end if;
  raise notice 'PASS  applicants cannot read platform settings';
end $$;
reset role;

do $$ begin
  if (select count(*) from public_launch_terms where public_ref = (select public_ref from applications where id = '00000000-0000-0000-0000-00000000a001')) <> 1 then
    raise exception 'FAIL  signed terms should be public once ready';
  end if;
  raise notice 'PASS  signed terms are published once ready';
end $$;
\echo ALL LAUNCH CONFIG TESTS PASSED
