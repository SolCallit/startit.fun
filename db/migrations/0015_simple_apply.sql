-- Simpler application: name, ticker, description, links, proof, image. Then fees. Then an optional starter's buy.

-- Project image: public, because it becomes the coin's image. Path is server-generated.
alter table applications
  add column image_path text check (image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|gif)$'),
  -- Starter's buy: what the launcher says they'll buy right after launch, in the pair token. 0 = none. Disclosed publicly.
  add column starter_buy_amount numeric(20, 9) not null default 0 check (starter_buy_amount >= 0 and starter_buy_amount <= 25);

alter table launches
  add column starter_buy_amount numeric(20, 9) not null default 0 check (starter_buy_amount >= 0 and starter_buy_amount <= 25),
  add column starter_buy_tx text check (starter_buy_tx ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$'),
  add column starter_buy_at timestamptz;

do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('project-images', 'project-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    on conflict (id) do nothing;
    execute $p$create policy project_image_owner_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'project-images' and (storage.foldername(name))[1] = auth.uid()::text
                  and public.owns_editable_app(((storage.foldername(name))[2])::uuid))$p$;
  end if;
end $$;

-- Submitting needs: at least one official link, proof the builder is in, and an image.
create or replace function submit_application(p_app uuid) returns application_status
language plpgsql security definer set search_path = public as $$
declare v_status application_status;
begin
  select status into v_status from applications where id = p_app and applicant_id = auth.uid();
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from application_links where application_id = p_app and kind in ('website', 'x', 'github')) then
    raise exception 'add the project''s website, X or GitHub' using errcode = '22023';
  end if;
  if not exists (select 1 from evidence_files where application_id = p_app and kind in ('authorization', 'founder_approval'))
     and not exists (select 1 from applications where id = p_app and coalesce(trim(founder_approval_statement), '') <> '') then
    raise exception 'upload proof the builder approved this launch' using errcode = '22023';
  end if;
  if not exists (select 1 from applications where id = p_app and image_path is not null) then
    raise exception 'add an image for the coin' using errcode = '22023';
  end if;
  return transition_application(p_app, 'submitted', null);
end $$;

-- Public directory: add the image and the disclosed starter's buy.
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
       coalesce(q.symbol, 'SOL') as quote_symbol,
       a.image_path,
       coalesce(l.starter_buy_amount, a.starter_buy_amount) as starter_buy_amount,
       l.starter_buy_tx
from applications a
left join launches l   on l.application_id = a.id
left join fee_configs fc on fc.id = l.fee_config_id and fc.disclosed_at is not null
left join treasuries t on t.application_id = a.id
left join quote_tokens q on q.mint = coalesce(l.quote_mint, a.quote_mint)
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_projects to anon, authenticated';
  end if;
end $$;

-- The starter's buy is part of the signed terms, so it freezes with them. Its transaction is recorded once,
-- only after the launch is finalized.
create or replace function freeze_launch_terms() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select status from applications where id = old.application_id) in ('ready_for_deployment', 'launched')
     and (new.terms_sha256, new.founder_wallet, new.launcher_wallet, new.fee_config_id, new.total_supply_raw, new.decimals,
          new.mint_authority_revoked, new.freeze_authority_revoked, new.insider_allocations, new.network, new.starter_buy_amount)
         is distinct from
         (old.terms_sha256, old.founder_wallet, old.launcher_wallet, old.fee_config_id, old.total_supply_raw, old.decimals,
          old.mint_authority_revoked, old.freeze_authority_revoked, old.insider_allocations, old.network, old.starter_buy_amount) then
    raise exception 'launch terms are frozen once ready for deployment' using errcode = '42501';
  end if;
  if new.starter_buy_tx is distinct from old.starter_buy_tx then
    if old.starter_buy_tx is not null then
      raise exception 'the starter''s buy is already recorded' using errcode = '42501';
    end if;
    if new.status <> 'finalized' or new.starter_buy_amount <= 0 then
      raise exception 'a starter''s buy is recorded only after a finalized launch that disclosed one' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
