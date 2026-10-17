create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

do $$
declare uid uuid := gen_random_uuid(); app uuid;
begin
  insert into auth.users (id, email) values (uid, 'simple@example.com');
  insert into applications (applicant_id, project_name, project_summary, token_name, ticker, token_concept, disclosures_acknowledged_at)
  values (uid, 'Pixel', 'Pixel art model', 'Pixel', 'PIXL', 'Pixel art model', now()) returning id into app;

  begin
    update applications set starter_buy_amount = 26 where id = app;
    raise exception 'starter buy above the cap accepted';
  exception when check_violation then raise notice 'PASS starter buy is capped';
  end;
  begin
    update applications set starter_buy_amount = -1 where id = app;
    raise exception 'negative starter buy accepted';
  exception when check_violation then raise notice 'PASS starter buy cannot be negative';
  end;
  begin
    update applications set image_path = '../../etc/passwd' where id = app;
    raise exception 'arbitrary image path accepted';
  exception when check_violation then raise notice 'PASS image path must be server-generated';
  end;
  update applications set image_path = uid || '/' || app || '/' || gen_random_uuid() || '.png', starter_buy_amount = 1.5 where id = app;
  assert (select starter_buy_amount from applications where id = app) = 1.5, 'starter buy saved';
  raise notice 'PASS image and starter buy saved';
end $$;

-- submit_application: needs a link, proof and an image.
create temp table t15 (k text primary key, v uuid);
grant all on t15 to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000015e1', 's15@example.com');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000015e1');
with ins as (
  insert into applications (applicant_id, project_name, project_summary, token_name, ticker, token_concept, disclosures_acknowledged_at)
  values ('00000000-0000-0000-0000-0000000015e1', 'Gloss', 'Glass UI kit', 'Gloss', 'GLOS', 'Glass UI kit', now())
  returning id)
insert into t15 select 'app', id from ins;

select pg_temp.expect_fail($$select submit_application((select v from t15 where k='app'))$$, 'submit without any link blocked');
insert into application_links (application_id, kind, url) values ((select v from t15 where k='app'), 'x', 'https://x.com/gloss');
select pg_temp.expect_fail($$select submit_application((select v from t15 where k='app'))$$, 'submit without proof blocked');
insert into evidence_files (application_id, kind, storage_path, sha256, mime_type, byte_size, uploaded_by)
values ((select v from t15 where k='app'), 'authorization', 'x/y/z.png', repeat('a', 64), 'image/png', 10, '00000000-0000-0000-0000-0000000015e1');
select pg_temp.expect_fail($$select submit_application((select v from t15 where k='app'))$$, 'submit without image blocked');
update applications set image_path = '00000000-0000-0000-0000-0000000015e1/' || (select v from t15 where k='app') || '/00000000-0000-0000-0000-000000000001.png'
 where id = (select v from t15 where k='app');
select submit_application((select v from t15 where k='app'));
do $$ begin
  assert (select status from applications where id = (select v from t15 where k='app')) = 'submitted', 'submitted';
  raise notice 'PASS X link, proof and image are enough to submit';
end $$;
reset role;
