-- 0013: "Paired with" — an optional, disclosed link from a project to a related token, project or person.
-- Informational only: on Raydium LaunchLab every token's on-chain quote asset is SOL (Raydium creates the
-- per-quote-token curve configs, not us). The pairing is screened like any other claim and shown publicly
-- with its relationship ("inspired by" vs "official"), so nobody reads it as an endorsement.

create type pair_kind as enum ('token', 'project', 'person');
create type pair_relationship as enum ('inspired_by', 'official');

alter table applications
  add column pair_kind pair_kind,
  add column pair_name text check (pair_name is null or length(trim(pair_name)) between 1 and 80),
  add column pair_url text check (pair_url is null or pair_url ~ '^https://[^\s@/]+(/\S*)?$'),
  add column pair_mint text check (pair_mint is null or pair_mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  add column pair_reason text check (pair_reason is null or length(pair_reason) between 1 and 600),
  add column pair_relationship pair_relationship,
  add constraint pair_token_needs_mint check (pair_kind is distinct from 'token' or pair_mint is not null);

-- Public projects expose the pairing only when it's complete.
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
       a.created_at
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
  end if;
end $$;
