-- Wallet sign-up creates a profile with the address and a short display name.
do $$
declare uid uuid := gen_random_uuid(); p profiles%rowtype;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (uid, null, jsonb_build_object('sub', 'web3:solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
                                        'custom_claims', jsonb_build_object('address', '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'chain', 'solana')));
  select * into p from profiles where id = uid;
  assert p.wallet_address = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'wallet address stored';
  assert p.display_name = '7xKX…gAsU', 'short display name: ' || p.display_name;
  assert exists (select 1 from user_roles where user_id = uid and role = 'applicant'), 'applicant role';
  raise notice 'PASS wallet sign-up creates profile with address';
end $$;

-- Email sign-up is unchanged.
do $$
declare uid uuid := gen_random_uuid(); p profiles%rowtype;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (uid, 'ada@example.com', '{}');
  select * into p from profiles where id = uid;
  assert p.wallet_address is null and p.display_name = 'ada', 'email profile';
  raise notice 'PASS email sign-up unchanged';
end $$;
