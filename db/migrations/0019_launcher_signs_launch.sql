-- 0019: the launcher signs the launch. The admin approves the exact launch parameters; the launcher's wallet then
-- signs one transaction that creates the coin and makes the disclosed starter's buy in the same instant.

alter table launches
  add column if not exists launch_signer    text,
  add column if not exists signer_tx_sha256 text check (signer_tx_sha256 ~ '^[a-f0-9]{64}$');

comment on column launches.preview_message_sha256 is 'Hash of the launch parameters the operator approved (launcher-signed flow) or of the operator-previewed transaction (older launches).';
comment on column launches.signer_tx_sha256 is 'Hash of the exact transaction built for the launch signer; only that transaction is broadcast.';

-- The person who launches can mark it launched, but only after it is verified on-chain (guard_launched_transition).
insert into status_transition_rules (from_status, to_status, actor)
select 'ready_for_deployment', 'launched', 'applicant'
where not exists (select 1 from status_transition_rules where from_status = 'ready_for_deployment' and to_status = 'launched' and actor = 'applicant');

-- Approval can come straight from planned, and a launch whose transaction never landed can be retried
-- under the same approval.
create or replace function guard_launch_status() returns trigger
language plpgsql as $$
declare
  ok boolean;
begin
  if old.status in ('submitted', 'finalized') and new.tx_signature is distinct from old.tx_signature then
    raise exception 'the launch transaction signature cannot change once submitted' using errcode = '42501';
  end if;
  if old.status = 'finalized' and (new.mint_address, new.verified_at, new.verified_mint_authority, new.verified_freeze_authority, new.verified_supply_raw)
     is distinct from (old.mint_address, old.verified_at, old.verified_mint_authority, old.verified_freeze_authority, old.verified_supply_raw) then
    raise exception 'a finalized launch record cannot be edited' using errcode = '42501';
  end if;
  if new.status is not distinct from old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('planned','previewed'), ('previewed','previewed'), ('previewed','operator_confirmed'), ('operator_confirmed','previewed'),
    ('operator_confirmed','submitted'), ('submitted','finalized'), ('submitted','failed'),
    ('failed','previewed'), ('previewed','failed'), ('operator_confirmed','failed'),
    ('planned','operator_confirmed'), ('failed','operator_confirmed'));
  if not ok then
    raise exception 'launch status cannot move from % to %', old.status, new.status using errcode = '22023';
  end if;
  if new.status = 'finalized' and (new.verified_at is null or new.verified_freeze_authority is not null) then
    raise exception 'a launch is finalized only after on-chain verification with no freeze authority' using errcode = '22023';
  end if;
  return new;
end $$;
