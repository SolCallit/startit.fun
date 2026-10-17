-- 0014: on-chain pairing. A launch's bonding curve is quoted in a token chosen from a staff-managed allowlist.
-- Raydium creates one LaunchLab global config per quote token; a launchpad then allow-lists that config for
-- its own platform (createPlatformAllowConfig). We store both, and only offer tokens that pass both checks.

create table quote_tokens (
  mint                  text primary key check (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  symbol                text not null check (symbol ~ '^[A-Za-z0-9.]{1,12}$'),
  name                  text not null check (length(trim(name)) between 1 and 60),
  decimals              int  not null check (decimals between 0 and 12),
  network               text not null check (network in ('solana-devnet', 'solana-mainnet')),
  launchlab_config_id   text not null check (launchlab_config_id ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  platform_allow_config text check (platform_allow_config ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  platform_allowed_at   timestamptz,
  enabled               boolean not null default false,
  added_by              uuid references profiles(id),
  created_at            timestamptz not null default now(),
  -- SOL is the platform's default config; anything else must be allow-listed on our platform first.
  constraint enabled_needs_allow check (
    not enabled or mint = 'So11111111111111111111111111111111111111112' or platform_allowed_at is not null)
);

alter table quote_tokens enable row level security;
create policy quote_tokens_read  on quote_tokens for select using (enabled or is_staff());
create policy quote_tokens_staff on quote_tokens for all using (is_staff()) with check (is_staff());
create trigger audit_quote_tokens after insert or update or delete on quote_tokens for each row execute function audit_row();

insert into quote_tokens (mint, symbol, name, decimals, network, launchlab_config_id, enabled)
values ('So11111111111111111111111111111111111111112', 'SOL', 'Solana', 9, 'solana-devnet',
        '7ZR4zD7PYfY2XxoG1Gxcy2EgEeGYrpxrwzPuwdUBssEt', true);

alter table applications add column quote_mint text references quote_tokens(mint);
alter table launches     add column quote_mint text references quote_tokens(mint);

-- Public directory: show what each project is paired with on-chain.
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_kind end as pair_kind,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_name end as pair_name,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_url end as pair_url,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_mint end as pair_mint,
       case when a.pair_kind is not null and a.pair_name is not null and a.pair_relationship is not null then a.pair_relationship end as pair_relationship,
       a.created_at,
       coalesce(l.quote_mint, a.quote_mint, 'So11111111111111111111111111111111111111112') as quote_mint,
       coalesce(q.symbol, 'SOL') as quote_symbol
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
left join quote_tokens q on q.mint = coalesce(l.quote_mint, a.quote_mint)
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
    execute 'grant select on quote_tokens to anon, authenticated';
  end if;
end $$;

-- Launch readiness: quote token must be enabled and match the application.
create or replace function launch_blockers(p_app uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_app applications%rowtype;
  v_launch launches%rowtype;
  v_fc fee_configs%rowtype;
  out text[] := '{}';
begin
  -- Only staff may see a launch checklist (transition_application calls this for a staff caller).
  if auth.uid() is not null and not is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into v_app from applications where id = p_app;
  select * into v_launch from launches where application_id = p_app;
  if v_launch.id is null then return array['launch configuration has not been created']; end if;
  select * into v_fc from fee_configs where id = v_launch.fee_config_id;
  if v_fc.approved_at is null then out := array_append(out, 'fee split has not been approved'); end if;
  if not exists (select 1 from treasuries where application_id = p_app) then out := array_append(out, 'community treasury is not set'); end if;
  if v_launch.founder_wallet is null then out := array_append(out, 'founder payout wallet is not set'); end if;
  if v_fc.launcher_bps > 0 and v_launch.launcher_wallet is null then out := array_append(out, 'launcher payout wallet is not set'); end if;
  if v_fc.launcher_bps = 0 and v_launch.launcher_wallet is not null then out := array_append(out, 'launcher wallet set but launcher share is 0%'); end if;
  if v_launch.terms_sha256 is null then out := array_append(out, 'launch terms have not been generated'); end if;
  if v_launch.mint_authority_revoked is distinct from true or v_launch.freeze_authority_revoked is distinct from true then
    out := array_append(out, 'mint and freeze authority must both be revoked at launch');
  end if;
  if not exists (select 1 from platform_settings where key = 'fee_router_address') then out := array_append(out, 'Fee Router address is not configured'); end if;
  if not exists (select 1 from agreements where application_id = p_app and signer_role = 'founder'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.founder_wallet) then
    out := array_append(out, 'founder has not signed the current terms with the founder wallet');
  end if;
  if v_fc.launcher_bps > 0 and not exists (select 1 from agreements where application_id = p_app and signer_role = 'launcher'
                 and document_sha256 = v_launch.terms_sha256 and signed_at is not null
                 and signer_wallet = v_launch.launcher_wallet) then
    out := array_append(out, 'launcher has not signed the current terms with the launcher wallet');
  end if;
  if not exists (select 1 from quote_tokens
                 where mint = coalesce(v_launch.quote_mint, v_app.quote_mint, 'So11111111111111111111111111111111111111112') and enabled) then
    out := array_append(out, 'the quote token is not enabled on the platform');
  end if;
  if coalesce(v_launch.quote_mint, v_app.quote_mint, 'So11111111111111111111111111111111111111112') is distinct from coalesce(v_app.quote_mint, 'So11111111111111111111111111111111111111112') then
    out := array_append(out, 'launch quote token does not match the application');
  end if;
  if v_app.status = 'ready_for_deployment' and v_launch.status <> 'finalized' then
    out := array_append(out, 'launch transaction has not been verified on-chain');
  end if;
  return out;
end $$;
