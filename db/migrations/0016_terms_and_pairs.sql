-- Terms of Use acceptance (append-only) and the pair catalog discovered from Raydium LaunchLab.

create table terms_acceptances (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  version     text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  wallet      text check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  user_agent  text check (length(user_agent) <= 512),
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);
alter table terms_acceptances enable row level security;
create policy terms_insert_own on terms_acceptances for insert to authenticated with check (user_id = auth.uid());
create policy terms_read_own on terms_acceptances for select to authenticated using (user_id = auth.uid() or is_staff());
-- No update or delete policy: an acceptance is a record, not a setting.

-- Pair catalog: every quote mint Raydium has a LaunchLab config for. `listed` = offered to applicants;
-- `enabled` still means allow-listed on our platform (needed at launch time).
alter table quote_tokens
  add column category text not null default 'custom' check (category in ('xstocks', 'prestocks', 'currencies', 'solana', 'majors', 'custom')),
  add column logo_url text check (logo_url ~ '^https://' and length(logo_url) <= 1024),
  add column token_program text check (token_program ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column listed boolean not null default false,
  add column synced_at timestamptz;

update quote_tokens set listed = true, category = 'solana' where mint = 'So11111111111111111111111111111111111111112';

drop policy if exists quote_tokens_read on quote_tokens;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where tablename = 'quote_tokens' and cmd = 'SELECT' loop
    execute format('drop policy %I on quote_tokens', p.policyname);
  end loop;
end $$;
create policy quote_tokens_read on quote_tokens for select using (enabled or listed or is_staff());

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert on terms_acceptances to authenticated';
    execute 'grant usage on sequence terms_acceptances_id_seq to authenticated';
  end if;
end $$;
