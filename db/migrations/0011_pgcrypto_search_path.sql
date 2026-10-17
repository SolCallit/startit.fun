-- 0011: on Supabase, pgcrypto (digest) lives in the `extensions` schema.
-- Functions that hash must be able to see it, or signups (audit chain) and screening claims fail.
alter function audit_log_chain() set search_path = public, extensions;
alter function claim_next_screening(text, text, text) set search_path = public, extensions;
