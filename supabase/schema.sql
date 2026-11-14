-- =====================================================================
-- Telegram Group Manager — database schema
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- ========== TABLES ==========
create table if not exists settings (
  chat_id          bigint primary key,
  group_title      text,
  welcome_message  text not null default 'Welcome {name}! 👋 Please read the rules with /rules.',
  rules_text       text not null default E'1. Be respectful\n2. No spam or links\n3. Stay on topic',
  max_warnings     int  not null default 3 check (max_warnings between 1 and 10),
  block_links      boolean not null default true,
  mute_minutes     int  not null default 60 check (mute_minutes between 1 and 10080),
  test_mode        boolean not null default false,  -- when true, admins are moderated too (for testing)
  updated_at       timestamptz not null default now()
);
alter table settings add column if not exists test_mode boolean not null default false;

create table if not exists members (
  id             bigserial primary key,
  chat_id        bigint not null,
  user_id        bigint not null,
  username       text,
  first_name     text,
  status         text not null default 'active'
                 check (status in ('active','muted','banned','left')),
  warning_count  int not null default 0,
  message_count  int not null default 0,
  joined_at      timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  unique (chat_id, user_id)
);

create table if not exists warnings (
  id            bigserial primary key,
  chat_id       bigint not null,
  user_id       bigint not null,
  reason        text not null,
  message_text  text,
  issued_by     text not null default 'bot',
  created_at    timestamptz not null default now()
);

create table if not exists banned_words (
  id          bigserial primary key,
  word        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists announcements (
  id            bigserial primary key,
  chat_id       bigint not null,
  text          text not null,
  scheduled_at  timestamptz not null,
  status        text not null default 'pending'
                check (status in ('pending','sent','failed')),
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);

create table if not exists activity_log (
  id          bigserial primary key,
  chat_id     bigint,
  user_id     bigint,
  username    text,
  event_type  text not null,  -- join | leave | message_deleted | warn | ban | unban | mute | unmute | command | announcement | error
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_created on activity_log (created_at desc);
create index if not exists idx_activity_type    on activity_log (event_type, created_at desc);
create index if not exists idx_members_chat     on members (chat_id, status);
create index if not exists idx_warnings_user    on warnings (chat_id, user_id, created_at desc);
create index if not exists idx_ann_due          on announcements (status, scheduled_at);

-- keep settings.updated_at fresh
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_settings_touch on settings;
create trigger trg_settings_touch before update on settings
  for each row execute function touch_updated_at();

-- ========== FUNCTIONS (called from n8n via /rest/v1/rpc/...) ==========

-- Upsert member on every message/join. p_increment = 1 for a message, 0 for a join.
create or replace function track_member(
  p_chat_id bigint, p_user_id bigint, p_username text, p_first_name text, p_increment int default 1
) returns members language sql as $$
  insert into members (chat_id, user_id, username, first_name, message_count, last_seen, status)
  values (p_chat_id, p_user_id, p_username, p_first_name, p_increment, now(), 'active')
  on conflict (chat_id, user_id) do update set
    username      = excluded.username,
    first_name    = excluded.first_name,
    message_count = members.message_count + p_increment,
    last_seen     = now(),
    -- a returning user (left, or re-added after a ban) becomes active again
    status        = case when p_increment = 0 or members.status in ('left','muted') then 'active'
                         else members.status end,
    joined_at     = case when p_increment = 0 and members.status in ('left','banned') then now()
                         else members.joined_at end
  returning *;
$$;

-- Add a warning atomically. Returns everything the bot needs to reply:
-- { chat_id, user_id, name, count, max, reason, reached_max }
drop function if exists add_warning(bigint,bigint,text,text,text);
create or replace function add_warning(
  p_chat_id bigint, p_user_id bigint, p_reason text, p_message text, p_issued_by text default 'bot'
) returns jsonb language plpgsql as $$
declare
  new_count int;
  uname     text;
  fname     text;
  max_w     int;
begin
  insert into warnings (chat_id, user_id, reason, message_text, issued_by)
  values (p_chat_id, p_user_id, p_reason, p_message, p_issued_by);

  -- make sure the member exists (e.g. /warn on someone the bot hasn't seen yet)
  insert into members (chat_id, user_id, message_count) values (p_chat_id, p_user_id, 0)
  on conflict (chat_id, user_id) do nothing;

  update members set warning_count = warning_count + 1
  where chat_id = p_chat_id and user_id = p_user_id
  returning warning_count, coalesce(first_name, username), first_name into new_count, uname, fname;

  select max_warnings into max_w from settings where chat_id = p_chat_id;
  new_count := coalesce(new_count, 1);
  max_w     := coalesce(max_w, 3);

  insert into activity_log (chat_id, user_id, username, event_type, details)
  values (p_chat_id, p_user_id, uname, 'warn',
          jsonb_build_object('reason', p_reason, 'count', new_count, 'max', max_w, 'by', p_issued_by));

  return jsonb_build_object(
    'chat_id', p_chat_id, 'user_id', p_user_id, 'name', coalesce(fname, uname, 'User'),
    'count', new_count, 'max', max_w, 'reason', p_reason, 'reached_max', new_count >= max_w);
end $$;

-- Change a member's status and log it in one call (used by n8n for ban/unban/mute/unmute).
-- p_details is merged into the log entry (e.g. reason, minutes).
drop function if exists set_member_status(bigint,bigint,text,text,text,boolean);
create or replace function set_member_status(
  p_chat_id bigint, p_user_id bigint, p_status text, p_event text, p_by text default 'bot',
  p_reset_warnings boolean default false, p_details jsonb default '{}'
) returns jsonb language plpgsql as $$
declare uname text;
begin
  insert into members (chat_id, user_id, status, message_count)
  values (p_chat_id, p_user_id, p_status, 0)
  on conflict (chat_id, user_id) do update set
    status = excluded.status,
    warning_count = case when p_reset_warnings then 0 else members.warning_count end
  returning coalesce(first_name, username) into uname;

  insert into activity_log (chat_id, user_id, username, event_type, details)
  values (p_chat_id, p_user_id, uname, p_event, jsonb_build_object('by', p_by) || coalesce(p_details, '{}'));

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ========== STATS VIEW (respects RLS) ==========
create or replace view group_stats with (security_invoker = true) as
select s.chat_id, s.group_title,
  (select count(*) from members m where m.chat_id = s.chat_id and m.status <> 'left')                        as total_members,
  (select count(*) from members m where m.chat_id = s.chat_id and m.last_seen > now() - interval '24 hours'
                                     and m.status <> 'left')                                                 as active_24h,
  (select count(*) from warnings w where w.chat_id = s.chat_id and w.created_at > now() - interval '7 days') as warnings_7d,
  (select count(*) from members m where m.chat_id = s.chat_id and m.status = 'banned')                       as banned,
  (select count(*) from activity_log a where a.chat_id = s.chat_id and a.event_type = 'message_deleted'
                                         and a.created_at > now() - interval '7 days')                       as deleted_7d
from settings s;

-- ========== ROW LEVEL SECURITY ==========
-- n8n uses the service_role key (bypasses RLS). Dashboard uses anon key + logged-in admin.
alter table settings      enable row level security;
alter table members       enable row level security;
alter table warnings      enable row level security;
alter table banned_words  enable row level security;
alter table announcements enable row level security;
alter table activity_log  enable row level security;

drop policy if exists "admin all settings"      on settings;
drop policy if exists "admin read members"      on members;
drop policy if exists "admin read warnings"     on warnings;
drop policy if exists "admin all banned_words"  on banned_words;
drop policy if exists "admin all announcements" on announcements;
drop policy if exists "admin read activity"     on activity_log;

create policy "admin all settings"      on settings      for all    to authenticated using (true) with check (true);
create policy "admin read members"      on members       for select to authenticated using (true);
create policy "admin read warnings"     on warnings      for select to authenticated using (true);
create policy "admin all banned_words"  on banned_words  for all    to authenticated using (true) with check (true);
create policy "admin all announcements" on announcements for all    to authenticated using (true) with check (true);
create policy "admin read activity"     on activity_log  for select to authenticated using (true);
-- Members' status is changed only by n8n (WF1/WF3), never directly from the browser.

-- The RPC functions are for n8n only (service_role). Block them for browser roles.
revoke execute on function track_member(bigint,bigint,text,text,int)                    from public, anon, authenticated;
revoke execute on function add_warning(bigint,bigint,text,text,text)                    from public, anon, authenticated;
revoke execute on function set_member_status(bigint,bigint,text,text,text,boolean,jsonb) from public, anon, authenticated;
grant  execute on function track_member(bigint,bigint,text,text,int)                    to service_role;
grant  execute on function add_warning(bigint,bigint,text,text,text)                    to service_role;
grant  execute on function set_member_status(bigint,bigint,text,text,text,boolean,jsonb) to service_role;

-- ========== REALTIME (live activity feed) ==========
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'activity_log') then
    alter publication supabase_realtime add table activity_log;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'members') then
    alter publication supabase_realtime add table members;
  end if;
end $$;
