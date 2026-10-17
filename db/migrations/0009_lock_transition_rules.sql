-- 0009: status_transition_rules had no RLS. On Supabase, public tables are writable by `authenticated`
-- by default, so a user could have inserted a rule granting themselves approval. Lock it down.
alter table status_transition_rules enable row level security;
create policy rules_read on status_transition_rules for select using (auth.uid() is not null);
-- No insert/update/delete policies: only migrations (table owner) can change the rules.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke insert, update, delete, truncate on status_transition_rules from anon, authenticated';
  end if;
end $$;
