-- Adds "Test mode": when on, the bot moderates admins too, so moderation
-- can be tested with a single (admin) account. Run once in Supabase → SQL Editor.
alter table settings add column if not exists test_mode boolean not null default false;
