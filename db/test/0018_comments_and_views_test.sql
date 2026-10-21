create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS  %  (%)', label, sqlerrm; return; end;
  raise exception 'FAIL  % — statement succeeded but should have failed', label;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000018a1', 'c1@example.com'), ('00000000-0000-0000-0000-0000000018a2', 'c2@example.com');
insert into applications (id, applicant_id, project_name, project_summary, token_name, ticker, token_concept, disclosures_acknowledged_at, status, submitted_at)
values ('00000000-0000-0000-0000-0000000018f1', '00000000-0000-0000-0000-0000000018a1', 'Cmt', 'x', 'Cmt', 'CMTX', 'x', now(), 'approved', now()),
       ('00000000-0000-0000-0000-0000000018f2', '00000000-0000-0000-0000-0000000018a1', 'Hidden', 'x', 'Hid', 'HIDX', 'x', now(), 'draft', null);
create temp table t18 (k text primary key, v text);
grant all on t18 to authenticated;
insert into t18 select 'pub', public_ref from applications where id = '00000000-0000-0000-0000-0000000018f1';
insert into t18 select 'hid', public_ref from applications where id = '00000000-0000-0000-0000-0000000018f2';
grant select, insert, update, delete on token_comments, token_comment_likes to authenticated;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000018a1');
insert into token_comments (public_ref, user_id, body) values ((select v from t18 where k='pub'), '00000000-0000-0000-0000-0000000018a1', 'gm');
select pg_temp.expect_fail($$insert into token_comments (public_ref, user_id, body) values ((select v from t18 where k='hid'), '00000000-0000-0000-0000-0000000018a1', 'x')$$, 'no comments on non-public projects');
select pg_temp.expect_fail($$insert into token_comments (public_ref, user_id, body) values ((select v from t18 where k='pub'), '00000000-0000-0000-0000-0000000018a2', 'x')$$, 'cannot comment as someone else');
select pg_temp.expect_fail($$insert into token_comments (public_ref, user_id, body) values ((select v from t18 where k='pub'), '00000000-0000-0000-0000-0000000018a1', '   ')$$, 'empty comment rejected');

select pg_temp.as_user('00000000-0000-0000-0000-0000000018a2');
insert into token_comments (public_ref, user_id, parent_id, body)
  select public_ref, '00000000-0000-0000-0000-0000000018a2', id, 'reply' from token_comments where body = 'gm';
insert into token_comments (public_ref, user_id, parent_id, body)
  select public_ref, '00000000-0000-0000-0000-0000000018a2', id, 'reply to reply' from token_comments where body = 'reply';
do $$ begin
  assert (select parent_id from token_comments where body = 'reply to reply') = (select id from token_comments where body = 'gm'), 'replies flatten to one level';
  raise notice 'PASS  replies stay one level deep';
end $$;
insert into token_comment_likes (comment_id, user_id) select id, '00000000-0000-0000-0000-0000000018a2' from token_comments where body = 'gm';
select pg_temp.expect_fail($$insert into token_comment_likes (comment_id, user_id) select id, '00000000-0000-0000-0000-0000000018a2' from token_comments where body = 'gm'$$, 'one like per person');
update token_comments set body = 'hijack' where body = 'gm';
do $$ begin
  assert exists (select 1 from token_comments where body = 'gm'), 'cannot edit others';
  raise notice 'PASS  only the author edits';
end $$;
select pg_temp.expect_fail($$update token_comments set public_ref = 'STI-0000-000000' where body = 'reply'$$, 'only text can change');
reset role;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000018a2');
do $$ begin
  assert (select count(*) from token_comments) = 3, 'others read public comments';
  raise notice 'PASS  anyone can read comments on public coins';
end $$;
reset role;

do $$
declare r text := (select v from t18 where k='pub'); n bigint;
begin
  n := record_token_view(r, repeat('a', 64));
  n := record_token_view(r, repeat('a', 64));
  n := record_token_view(r, repeat('b', 64));
  assert n = 2, 'unique visitors per day';
  assert record_token_view((select v from t18 where k='hid'), repeat('c', 64)) = 0, 'no views on hidden';
  assert token_view_count(r) = 2, 'count';
  raise notice 'PASS  views count each visitor once a day';
end $$;
