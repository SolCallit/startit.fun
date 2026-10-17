-- 0012: wallet accounts. "Sign in with Web3" (Solana) users have no email; their account is their wallet.

alter table profiles add column if not exists wallet_address text unique
  check (wallet_address is null or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace function wallet_from_meta(m jsonb) returns text
language sql immutable set search_path = public as $$
  select nullif(coalesce(
    m -> 'custom_claims' ->> 'address',
    m ->> 'address',
    substring(m ->> 'sub' from '^web3:solana:(.+)$')
  ), '')
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wallet text := wallet_from_meta(coalesce(new.raw_user_meta_data, '{}'::jsonb));
begin
  if v_wallet !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then v_wallet := null; end if;
  insert into profiles (id, display_name, email_verified_at, wallet_address)
  values (new.id,
          left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                        nullif(split_part(new.email, '@', 1), ''),
                        case when v_wallet is not null then left(v_wallet, 4) || '…' || right(v_wallet, 4) end,
                        'Founder'), 120),
          new.email_confirmed_at,
          v_wallet)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role) values (new.id, 'applicant') on conflict do nothing;
  return new;
end $$;

revoke execute on function handle_new_user() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function handle_new_user() from anon, authenticated';
  end if;
end $$;
