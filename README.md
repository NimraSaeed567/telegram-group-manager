# Telegram Group Manager

A simple Telegram group management system: a bot that welcomes and moderates members, plus a web dashboard for admins.

**Stack:** Telegram Bot API · n8n (bot logic) · Supabase (database, login, realtime) · React dashboard on Vercel.

| Feature | Where it runs |
|---|---|
| Welcome new members with a customizable message | n8n — WF1 |
| Auto-moderation: delete links / banned words, warn, auto-ban at max warnings | n8n — WF1 |
| Commands: `/rules`, `/stats`, and for admins `/warn`, `/ban`, `/mute`, `/unmute` (reply to a message) | n8n — WF1 |
| Scheduled announcements | n8n — WF2 |
| Dashboard: stats + chart, live activity feed, members (ban/mute/unban), moderation settings, announcements | React + Supabase, actions via n8n — WF3 |

Group admins are never auto-moderated. For testing with a single account, the Moderation page has a **Test mode** switch that moderates admins too (keep it off in production).

## How it fits together

```
Telegram group ──► n8n WF1 Group Bot ──► Telegram Bot API
                         │
                         ▼
                     Supabase  ◄── n8n WF2 Scheduler (every minute)
                         ▲
                         │ (login + Row Level Security)
Admin browser ──► React dashboard ──► Vercel api/action ──► n8n WF3 Admin Actions ──► Telegram
```

- **n8n** hosts the bot because it has to be online 24/7 to receive Telegram updates and run the scheduler. Each behaviour is a visual workflow.
- **Supabase** stores members, warnings, settings and the activity log, handles dashboard login, and pushes live updates to the activity feed.
- **Vercel** hosts the dashboard. Its small server function (`api/action.js`) checks the admin is logged in before any ban/mute, so the n8n secret stays off the browser.
- **The bot token never reaches the browser** — only n8n has it.

## Project layout

```
supabase/schema.sql      tables, functions, stats view, security rules, realtime
supabase/seed.sql        sample banned words
n8n/wf1-group-bot.json                 import into n8n
n8n/wf2-announcement-scheduler.json    import into n8n
n8n/wf3-admin-actions.json             import into n8n
dashboard/               React app (Vercel root directory)
dashboard/api/action.js  Vercel server function
docs/STEPS.md            the steps followed to build this
```

## Setup

### 1. Telegram bot
1. In Telegram, open **@BotFather** → `/newbot` → pick a name and username. Copy the **bot token**.
2. `/setprivacy` → choose the bot → **Disable** (so it can read all group messages).
3. `/setcommands` → choose the bot → paste:
   ```
   rules - Show group rules
   stats - Show group statistics
   warn - (admin) Warn the replied user
   ban - (admin) Ban the replied user
   mute - (admin) Mute the replied user
   unmute - (admin) Unmute the replied user
   ```
4. Create a test group, add the bot, and **promote it to admin** with *Delete messages* and *Ban users*.
5. Group settings → Chat history for new members → **Visible**. This turns it into a supergroup, which ban/mute need.

### 2. Supabase
1. Create a project.
2. **SQL Editor** → run `supabase/schema.sql`, then `supabase/seed.sql`. (If you created the database with an older `schema.sql`, also run the files in `supabase/migrations/`.)
3. **Authentication → Sign In / Providers**: turn **off** “Allow new users to sign up”.
4. **Authentication → Users → Add user**: create the admin email + password for the dashboard.
5. **Project Settings → API**: copy the Project URL, the `anon` key (dashboard) and the `service_role` key (**n8n only — never in the frontend or Git**).

### 3. n8n (n8n Cloud, or any self-hosted n8n with a public HTTPS URL)
1. **Workflows → Import from file** → import the three files in `n8n/`.
2. In each workflow, open the **Config** node and fill in: bot token, Supabase URL, `service_role` key (and in WF3 the admin secret — any long random string).
3. In WF1, open **Telegram Trigger** → create a *Telegram API* credential with the bot token.
4. In WF3, open **Webhook** and copy the **Production URL** (ends in `/webhook/admin-action`).
5. **Activate all three workflows.** Activating WF1 registers the bot’s webhook with Telegram.
6. Send any message in the group — the group now appears in Supabase (`settings` table) and in the dashboard.

> A bot has only one webhook. “Listen for test event” in n8n points Telegram at the *test* URL; activating the workflow switches it back to production. Always re-activate WF1 after testing.

### 4. Dashboard
Local:
```bash
cd dashboard
cp .env.example .env     # fill in the values
npm install
npm run dev              # http://localhost:5173 (also serves /api/action locally)
```
Deploy: Vercel → New Project → import the repo → **Root directory: `dashboard`** → add the variables from `.env.example` → Deploy.

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | Supabase `anon` key |
| `N8N_ACTION_WEBHOOK_URL` | WF3 production webhook URL |
| `N8N_ACTION_SECRET` | same secret as WF3’s Config node |

## Security
- Bot token and `service_role` key live only in n8n.
- The dashboard uses the `anon` key; Row Level Security lets only logged-in users read data, and members can only be banned/muted through n8n.
- Public sign-ups are disabled — only admins you create can log in.
- Dashboard actions go through `api/action`, which verifies the login and adds a shared secret that WF3 checks.
- Exported workflows contain placeholders (`YOUR_BOT_TOKEN`, …). **Re-export with placeholders before pushing.** Never commit `.env`.
