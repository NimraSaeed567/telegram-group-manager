-- Sample banned words. Edit them later from the dashboard (Moderation page).
insert into banned_words (word) values
  ('spam'), ('scam'), ('casino'), ('free money'), ('crypto giveaway')
on conflict (word) do nothing;

-- The settings row is created automatically by the bot (WF1) on the first message
-- it sees in the group, because that is when the chat_id becomes known.
