-- Token page community: threaded comments with likes, and a daily-unique view counter.

create or replace function is_public_ref(p_ref text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications where public_ref = p_ref
                 and status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched'));
$$;

create table token_comments (
  id           uuid primary key default gen_random_uuid(),
  public_ref   text not null,
  user_id      uuid not null references profiles(id) on delete cascade,
  parent_id    uuid references token_comments(id) on delete cascade,
  author_name  text not null default '',
  author_wallet text,
  body         text not null check (length(trim(body)) between 1 and 1000),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);
create index token_comments_ref on token_comments (public_ref, created_at desc);
create index token_comments_parent on token_comments (parent_id);

create table token_comment_likes (
  comment_id uuid not null references token_comments(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- Author snapshot, reply rules and a simple rate limit.
create or replace function token_comment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent token_comments%rowtype;
begin
  if tg_op = 'INSERT' then
    if not is_public_ref(new.public_ref) then raise exception 'comments are open on public projects only' using errcode = '42501'; end if;
    if new.parent_id is not null then
      select * into v_parent from token_comments where id = new.parent_id;
      if v_parent.id is null or v_parent.public_ref <> new.public_ref then raise exception 'reply to a comment on this coin' using errcode = '22023'; end if;
      if v_parent.parent_id is not null then new.parent_id := v_parent.parent_id; end if;  -- one level of replies, like YouTube
    end if;
    if (select count(*) from token_comments where user_id = new.user_id and created_at > now() - interval '1 minute') >= 8 then
      raise exception 'slow down: too many comments in a minute' using errcode = '54000';
    end if;
    select coalesce(display_name, ''), wallet_address into new.author_name, new.author_wallet from profiles where id = new.user_id;
    new.created_at := now(); new.edited_at := null;
  else
    if new.public_ref <> old.public_ref or new.user_id <> old.user_id or new.parent_id is distinct from old.parent_id
       or new.author_name <> old.author_name or new.author_wallet is distinct from old.author_wallet or new.created_at <> old.created_at then
      raise exception 'only the text of a comment can change' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger token_comments_guard before insert or update on token_comments for each row execute function token_comment_guard();

alter table token_comments enable row level security;
create policy comments_read on token_comments for select using (is_public_ref(public_ref));
create policy comments_insert on token_comments for insert to authenticated with check (user_id = auth.uid());
create policy comments_edit on token_comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy comments_delete on token_comments for delete to authenticated using (user_id = auth.uid() or is_staff());

alter table token_comment_likes enable row level security;
create policy likes_read on token_comment_likes for select using (true);
create policy likes_insert on token_comment_likes for insert to authenticated with check (user_id = auth.uid());
create policy likes_delete on token_comment_likes for delete to authenticated using (user_id = auth.uid());

-- Views: one per visitor per coin per day. The visitor is a salted hash made on the server; no IPs are stored.
create table token_views (
  public_ref   text not null,
  day          date not null default current_date,
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  primary key (public_ref, day, visitor_hash)
);
alter table token_views enable row level security;
-- No direct access: only through the functions below.

create or replace function record_token_view(p_ref text, p_visitor text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not is_public_ref(p_ref) or p_visitor !~ '^[a-f0-9]{64}$' then return 0; end if;
  insert into token_views (public_ref, visitor_hash) values (p_ref, p_visitor) on conflict do nothing;
  return (select count(*) from token_views where public_ref = p_ref);
end $$;

create or replace function token_view_count(p_ref text) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from token_views where public_ref = p_ref;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on token_comments, token_comment_likes to anon, authenticated';
    execute 'grant insert, update, delete on token_comments to authenticated';
    execute 'grant insert, delete on token_comment_likes to authenticated';
    execute 'revoke all on token_views from anon, authenticated';
    execute 'grant execute on function record_token_view(text, text), token_view_count(text), is_public_ref(text) to anon, authenticated';
  end if;
end $$;

-- Official links of public projects, for the coin page.
create or replace view public_project_links with (security_barrier = true) as
select a.public_ref, l.kind, l.url
from application_links l join applications a on a.id = l.application_id
where a.status in ('approved', 'launch_config_pending', 'ready_for_deployment', 'launched');
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on public_project_links to anon, authenticated';
  end if;
end $$;
