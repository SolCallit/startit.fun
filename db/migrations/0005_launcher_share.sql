-- 0005: four-way fee split. Default 15% platform / 30% founder / 5% launcher / 50% community.
-- When the founder launches their own project there is no separate launcher: 20 / 30 / 0 / 50.

alter type fee_recipient add value if not exists 'launcher';

-- ── Applications ──
alter table applications add column applicant_is_founder boolean;
alter table applications add column proposed_launcher_bps int not null default 500;
alter table applications alter column proposed_platform_bps set default 1500;
alter table applications drop constraint proposed_fees_sum;
alter table applications add constraint proposed_fees_sum check (
  proposed_platform_bps >= 0 and proposed_founder_bps >= 0 and proposed_launcher_bps >= 0 and proposed_community_bps >= 0
  and proposed_platform_bps + proposed_founder_bps + proposed_launcher_bps + proposed_community_bps = 10000);
-- A founder launching their own project can't also take the launcher share.
alter table applications add constraint self_launch_no_launcher_share check (
  applicant_is_founder is not true or proposed_launcher_bps = 0);

-- ── Fee configs ──
alter table fee_configs drop constraint non_default_needs_reason;
alter table fee_configs drop column is_default;
alter table fee_configs drop constraint fee_sum_exact;
alter table fee_configs add column launcher_bps int not null default 0 check (launcher_bps between 0 and 10000);
alter table fee_configs add constraint fee_sum_exact check (platform_bps + founder_bps + launcher_bps + community_bps = 10000);
alter table fee_configs add column is_default boolean generated always as (
  (platform_bps = 1500 and founder_bps = 3000 and launcher_bps = 500 and community_bps = 5000)
  or (platform_bps = 2000 and founder_bps = 3000 and launcher_bps = 0 and community_bps = 5000)) stored;
alter table fee_configs add constraint non_default_needs_reason check (is_default or coalesce(trim(deviation_reason), '') <> '');

create or replace function freeze_approved_fee_config() returns trigger
language plpgsql as $$
begin
  if old.approved_at is not null then
    if tg_op = 'DELETE' then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
    if (new.platform_bps, new.founder_bps, new.launcher_bps, new.community_bps, new.approved_by, new.approved_at, new.deviation_reason)
       is distinct from
       (old.platform_bps, old.founder_bps, old.launcher_bps, old.community_bps, old.approved_by, old.approved_at, old.deviation_reason)
       or (old.disclosed_at is not null and new.disclosed_at is distinct from old.disclosed_at) then
      raise exception 'approved fee configs are immutable' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- ── Public read model gains the launcher share (appended column) ──
create or replace view public_projects with (security_barrier = true) as
select a.public_ref, a.project_name, a.project_summary, a.token_name, a.ticker, a.chain,
       a.token_concept, a.insider_allocation_disclosure, a.status,
       fc.platform_bps, fc.founder_bps, fc.community_bps, fc.disclosed_at as fees_disclosed_at,
       l.network, l.mint_address, l.launchlab_pool_address, l.cpmm_pool_address, l.mint_authority_revoked, l.freeze_authority_revoked,
       l.total_supply_raw, l.decimals, l.insider_allocations, l.tx_signature as launch_tx,
       t.address as treasury_address, t.is_multisig, t.threshold, t.control_rules,
       fc.launcher_bps
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');
