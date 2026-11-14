# Telegram Group Manager — Steps I Followed

## 1. Planning
**Requirement:** a simple Telegram group management system — clean UI, working features, and a record of the steps followed.

**Features I chose** (kept small on purpose so everything works well):
1. Welcome new members with a message the admin can edit.
2. Auto-moderation: delete messages with links or banned words, warn the sender, auto-ban at the warning limit (default 3). Admins are never moderated.
3. Bot commands: `/rules`, `/stats` for everyone; `/warn`, `/ban`, `/mute`, `/unmute` for admins (as a reply).
4. Scheduled announcements.
5. Admin dashboard: stats and chart, live activity feed, members with ban/mute/unban, moderation settings, announcements, full activity log.

**Architecture and why each tool:**
- **n8n** runs the bot — it must be online 24/7 for Telegram webhooks and the scheduler, and each behaviour is a visual workflow that is easy to show and change.
- **Supabase** is the database, the dashboard login, and the realtime feed. Row Level Security protects the data.
- **Vercel** hosts the dashboard. A small server function checks the admin is logged in before forwarding ban/mute requests to n8n, so no secret is in the browser.

<!-- ![Architecture](screenshots/00-architecture.png) -->

## 2. Telegram bot setup
- Created the bot with @BotFather and set its command list.
- Disabled privacy mode so the bot can read every group message (needed for moderation).
- Added the bot to a test supergroup as admin with *Delete messages* and *Ban users*.

<!-- ![BotFather](screenshots/01-botfather.png) -->
<!-- ![Bot admin rights](screenshots/02-bot-admin.png) -->

## 3. Database design (Supabase)
| Table | Stores |
|---|---|
| `settings` | one row per group: welcome message, rules, max warnings, link blocking, mute length |
| `members` | everyone the bot has seen: status (active/muted/banned/left), warning and message counts, last seen |
| `warnings` | each warning with reason, original message, who issued it |
| `banned_words` | the word filter |
| `announcements` | scheduled posts and their status (pending/sent/failed) |
| `activity_log` | every event — joins, deletions, warnings, bans, commands, announcements |

- **Functions** `track_member`, `add_warning`, `set_member_status` do each update in one atomic database call (no race conditions on counters) and write to the activity log at the same time.
- **View** `group_stats` calculates the numbers for the Overview cards and `/stats`.
- **Security:** RLS is on for every table. Logged-in admins can read data and edit settings/banned words/announcements, but member status can only be changed by n8n. The functions can only be called with the service key (n8n).
- **Realtime** is on for `activity_log` and `members`, which powers the live feed.
- Public sign-ups are disabled; the admin account was created by hand.

<!-- ![Tables](screenshots/03-tables.png) -->
<!-- ![Auth settings](screenshots/04-auth.png) -->

## 4. Bot logic (n8n)
**WF1 — Group Bot.** Telegram Trigger → *Normalize* (turns the raw update into a clean object) → *Ensure settings* (creates the group’s settings row on first contact) → *Route by type*:
- **join** — add each new member, log it, send the welcome message with `{name}` replaced.
- **leave** — mark the member as left and log it.
- **chat** — track the sender and check if they are an admin, then:
  - **message** → *Check violation* (links / banned words; admins skipped) → delete the message, log it, add a warning → if the limit is reached, ban and announce it; otherwise post “warning 2/3”.
  - **command** → log it → `/rules`, `/stats`, or the admin commands. Admin commands check the sender is an admin and that they replied to someone, then make one Telegram call; on success the member’s status is saved, on failure the reason is posted.

**WF2 — Announcement Scheduler.** Every minute it *claims* due announcements in one update (pending → sent), so nothing is posted twice even if a run overlaps. Each one is posted; if Telegram refuses, it is marked *failed* with the reason.

**WF3 — Admin Actions.** A webhook used only by the dashboard. It checks the shared secret, then bans / unbans / mutes / unmutes / sends a message, records the change and replies `{ ok: true }` or the error.

Error handling: every Telegram call returns its result instead of stopping the workflow, so one failed call (for example deleting a message older than 48 hours) doesn’t break the rest.

<!-- ![WF1](screenshots/05-wf1.png) -->
<!-- ![WF2](screenshots/06-wf2.png) -->
<!-- ![WF3](screenshots/07-wf3.png) -->

## 5. Dashboard (React + Vercel)
| Page | What it does |
|---|---|
| Login | email + password (Supabase Auth); every other page requires login |
| Overview | 5 stat cards, 7-day chart (joins / warnings / removed messages), live activity feed |
| Members | search, filter by status, sort; mute / unmute / ban / unban with confirmation; click a member for their warning history |
| Moderation | welcome message (with live preview) and rules; link blocking, warning limit, mute length; banned words list |
| Announcements | schedule a post or send now; upcoming list with cancel; history with sent/failed status |
| Activity | full log with filters by type and date, 25 per page |

UI decisions: Telegram blue as the main colour, Inter font, light and dark mode, mobile layout with a slide-out menu. Every list has a loading skeleton, an empty state and an error state; every action shows a spinner and a toast; destructive actions ask for confirmation. Copy is short and plain for non-technical admins.

<!-- ![Overview](screenshots/08-overview.png) -->
<!-- ![Members](screenshots/09-members.png) -->
<!-- ![Moderation](screenshots/10-moderation.png) -->
<!-- ![Mobile + dark mode](screenshots/11-mobile-dark.png) -->

## 6. Deployment
- Database: Supabase.
- Bot workflows: n8n Cloud (all three activated).
- Dashboard: Vercel, root directory `dashboard`, environment variables set in the Vercel project.

## 7. Testing
Tested on the live setup (n8n Cloud + Supabase + Telegram test group).

| Test | Result |
|---|---|
| `/rules` and `/stats` reply in the group | ✅ |
| Rules edited in the dashboard → `/rules` shows the new text immediately | ✅ |
| Message with a link → deleted, “⚠️ warning 1/3: Links are not allowed” | ✅ |
| Message with a banned word → deleted, “warning 2/3” | ✅ |
| 3rd violation → ban step runs (on the owner Telegram refuses, bot reports it and resets warnings) | ✅ |
| Block links turned off in the dashboard → links are no longer deleted | ✅ |
| Group admins are not moderated (Test mode off) | ✅ |
| Live activity feed and Activity page update instantly | ✅ |
| Announcement “Send now” posts immediately | ✅ |
| Scheduled announcement posts on time and shows “Sent” | ✅ |
| `api/action` without a valid login → 401; n8n webhook with wrong secret → 401 | ✅ |
| New member welcome (needs a second account) | ☐ |
| Ban / mute / unban of a normal member from dashboard and commands (needs a second account) | ☐ |

**Test mode.** Moderation can’t be tried on the group owner, so I added a *Test mode* switch (Moderation page). When on, admins are moderated too. Telegram never allows banning the owner, so at the warning limit the bot explains that and resets the warnings. It is off by default and must stay off in production.

**Problems found while testing and how I fixed them**
- *Supabase URL typo in a workflow* → n8n showed “incorrect host”; corrected the Config node.
- *Live feed only updated after refresh* → React’s development mode mounts pages twice and both used the same realtime channel name, so the second subscription was cancelled. Each page now uses a unique channel, plus a 10-second auto-refresh fallback if realtime disconnects.
- *“Send now” crashed the local server* → the login check used a library feature that needs Node 22. Replaced it with a direct call to Supabase Auth that works on any Node version.
- *Unclear error messages (“Not Found”)* → raw Telegram errors are now translated into plain sentences that say what to fix (e.g. “The bot token in n8n is missing or wrong”).
- *A failed ban was still recorded as banned* → the bot now checks Telegram’s answer and only marks a member banned when the ban really happened.

## 8. Security
- Bot token and Supabase `service_role` key exist only in n8n.
- Public sign-ups disabled; RLS on every table.
- Dashboard actions: login verified by the Vercel function + shared secret checked by n8n.
- No secrets in Git (`.env` ignored, workflow exports use placeholders).

## 9. What I would add next
- Several groups per admin with per-group permissions
- CAPTCHA for new members
- Flood / rate limiting
- AI spam detection
- Members can report messages to admins
