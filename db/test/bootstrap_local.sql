-- Local-only stand-in for Supabase's auth schema so migrations and tests run on plain Postgres.
-- Never apply this to a Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Columns the real Supabase auth.users has that our migrations' triggers read.
alter table auth.users add column if not exists raw_user_meta_data jsonb;
alter table auth.users add column if not exists email_confirmed_at timestamptz;

-- Match Supabase: pgcrypto lives in the `extensions` schema, which is on the default search_path
-- but NOT on a function's pinned `search_path = public`. Catches functions that forget it.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter database startit_test set search_path = "$user", public, extensions;
