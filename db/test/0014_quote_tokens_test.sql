do $$
declare uid uuid := gen_random_uuid(); app uuid;
begin
  assert exists (select 1 from quote_tokens where symbol = 'SOL' and enabled), 'SOL seeded and enabled';
  raise notice 'PASS SOL quote token seeded';

  begin
    insert into quote_tokens (mint, symbol, name, decimals, network, launchlab_config_id, enabled)
    values ('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 'SPYx', 'SP500 xStock', 8, 'solana-devnet', '7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt', true);
    raise exception 'enabled a quote token that is not allow-listed on our platform';
  exception when check_violation then raise notice 'PASS non-SOL quote token needs platform allow-config before enabling';
  end;

  insert into auth.users (id, email) values (uid, 'quote@example.com');
  begin
    insert into applications (applicant_id, project_name, quote_mint) values (uid, 'Q', 'NotARealMint1111111111111111111111111111111');
    raise exception 'unknown quote mint accepted';
  exception when foreign_key_violation then raise notice 'PASS application quote mint must be on the allowlist';
  end;
end $$;
