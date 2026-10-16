-- 0008: payouts through Squads proposals, reconciliation, public fee records.

-- One executed Squads transaction pays several recipients, so payout signatures aren't unique.
alter table payouts drop constraint if exists payouts_tx_signature_key;
create index payouts_tx_signature_idx on payouts (tx_signature);

alter table payouts
  add column squads_transaction_index bigint,
  add column proposal_signature text,
  add column proposed_by uuid references profiles(id),
  add column proposed_at timestamptz,
  add column confirmed_at timestamptz;

-- Planned payouts for a claim can never exceed the claim.
create function guard_payout_total() returns trigger
language plpgsql as $$
declare v_claim numeric; v_total numeric;
begin
  select amount_raw into v_claim from fee_claims where id = new.source_claim_id;
  select coalesce(sum(amount_raw), 0) into v_total from payouts where source_claim_id = new.source_claim_id and id <> new.id;
  if v_total + new.amount_raw > v_claim then
    raise exception 'payouts for claim % would exceed the amount collected', new.source_claim_id using errcode = '22023';
  end if;
  return new;
end $$;
create trigger payouts_total_guard before insert on payouts for each row execute function guard_payout_total();

-- Payout lifecycle: pending → submitted (Squads proposal) → confirmed (executed on-chain). Amounts and recipients are fixed.
create function guard_payout_update() returns trigger
language plpgsql as $$
begin
  if (new.amount_raw, new.recipient, new.recipient_address, new.source_claim_id, new.launch_id)
     is distinct from (old.amount_raw, old.recipient, old.recipient_address, old.source_claim_id, old.launch_id) then
    raise exception 'payout amount and recipient are fixed once planned' using errcode = '42501';
  end if;
  if old.status = 'confirmed' and (new.status, new.tx_signature) is distinct from (old.status, old.tx_signature) then
    raise exception 'confirmed payouts are final' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not ((old.status, new.status) in (
      ('pending','submitted'), ('submitted','confirmed'), ('submitted','pending'), ('submitted','failed'), ('pending','failed'), ('failed','pending'))) then
    raise exception 'payout cannot move from % to %', old.status, new.status using errcode = '22023';
  end if;
  if new.status = 'submitted' and new.squads_transaction_index is null then
    raise exception 'a submitted payout must reference its Squads transaction' using errcode = '22023';
  end if;
  if new.status = 'confirmed' and (new.tx_signature is null or new.confirmed_at is null) then
    raise exception 'a confirmed payout needs its on-chain signature' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger payouts_update_guard before update on payouts for each row execute function guard_payout_update();
create trigger payouts_no_delete before delete on payouts for each row execute function forbid_mutation();

-- Per-launch ledger (staff; RLS of the caller applies).
create view fee_ledger with (security_invoker = true) as
select l.id as launch_id, a.id as application_id, a.public_ref, a.project_name, a.ticker,
       coalesce((select sum(amount_raw) from fee_claims c where c.launch_id = l.id), 0) as collected_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id), 0) as planned_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id and p.status = 'confirmed'), 0) as confirmed_raw,
       coalesce((select sum(amount_raw) from payouts p where p.launch_id = l.id and p.status in ('pending','submitted')), 0) as outstanding_raw,
       (select count(*) from payouts p where p.launch_id = l.id and p.status = 'failed') as failed_count
from launches l join applications a on a.id = l.application_id
where l.status = 'finalized';

-- Public: every fee collection, with its transaction.
create view public_fee_claims with (security_barrier = true) as
select a.public_ref, c.source, c.amount_raw, c.quote_mint, c.tx_signature, c.slot, c.observed_at
from fee_claims c join launches l on l.id = c.launch_id join applications a on a.id = l.application_id
where a.status = 'launched';

create or replace view public_payouts as
select a.public_ref, p.recipient, p.recipient_address, p.amount_raw, p.status, p.tx_signature, p.updated_at
from payouts p join launches l on l.id = p.launch_id join applications a on a.id = l.application_id
where a.status = 'launched';

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_fee_claims, public_payouts to anon, authenticated';
    execute 'grant select on fee_ledger to authenticated';
  end if;
end $$;
