-- 0003: review queue read model. security_invoker = true, so the caller's RLS applies:
-- staff see every row, applicants see only their own (and can't see screening internals through it,
-- because screening_* RLS hides those rows → counts come back as 0 / null).
create view review_queue with (security_invoker = true) as
select a.id, a.public_ref, a.project_name, a.ticker, a.status, a.submitted_at, a.updated_at,
       r.id as latest_run_id, r.status as latest_run_status,
       rep.recommendation, rep.confidence,
       coalesce(f.flagged, 0) as flagged_count,
       coalesce(f.needs_review, 0) as needs_review_count
from applications a
left join lateral (
  select id, status from screening_runs sr where sr.application_id = a.id order by sr.queued_at desc limit 1
) r on true
left join screening_reports rep on rep.run_id = r.id
left join lateral (
  select count(*) filter (where status = 'FLAGGED') as flagged,
         count(*) filter (where status = 'NEEDS_REVIEW') as needs_review
  from screening_findings sf where sf.run_id = r.id
) f on true;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on review_queue to authenticated';
  end if;
end $$;
