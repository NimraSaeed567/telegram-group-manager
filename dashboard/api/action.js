// Vercel serverless function: the only path from the dashboard to Telegram.
// 1. Verifies the caller is a logged-in admin (Supabase access token).
// 2. Forwards the action to the n8n "Admin Actions" webhook with a shared secret.
// The n8n secret and the bot token never reach the browser.

const ALLOWED = ['ban', 'unban', 'mute', 'unmute', 'send_message'];

// Turn raw Telegram / n8n errors into plain sentences an admin can act on.
function friendlyError(raw, status) {
  const e = String(raw || '').toLowerCase();
  if (status === 404 || e.includes('not registered') || e.includes('webhook'))
    return 'The bot service is offline. Publish the "WF3 - Admin Actions" workflow in n8n.';
  if (e === 'unauthorized' || status === 401)
    return 'The dashboard and the bot service secrets don’t match. Check N8N_ACTION_SECRET and WF3’s Config.';
  if (e === 'not found' || e.includes('bot token'))
    return 'The bot token in n8n is missing or wrong. Paste the token into WF3’s Config node.';
  if (e.includes('chat not found'))
    return 'The bot can’t find this group. Make sure it is still a member of the group.';
  if (e.includes('not enough rights') || e.includes('need administrator rights') || e.includes('not an administrator'))
    return 'The bot needs admin rights in the group (Ban users / Delete messages).';
  if (e.includes('chat owner') || e.includes('is an administrator') || e.includes("can't restrict self") || e.includes('administrator of the chat'))
    return 'Telegram doesn’t allow banning or muting group admins or the owner.';
  if (e.includes('user not found') || e.includes('participant_id_invalid'))
    return 'This person is no longer in the group.';
  if (e.includes('too many requests'))
    return 'Telegram is rate-limiting the bot. Try again in a minute.';
  return raw ? `Telegram said: ${raw}` : 'Something went wrong. Please try again.';
}

// Ask Supabase Auth who owns this access token (plain fetch: no extra packages, works on any Node version).
async function getUser(token) {
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ ok: false, error: 'Not logged in' });

  const user = await getUser(token).catch(() => null);
  if (!user?.id) return res.status(401).json({ ok: false, error: 'Not logged in' });

  const { action, chat_id, user_id, text } = req.body || {};
  if (!ALLOWED.includes(action)) return res.status(400).json({ ok: false, error: 'Invalid action' });
  if (!chat_id) return res.status(400).json({ ok: false, error: 'chat_id is required' });
  if (action === 'send_message' && !String(text || '').trim())
    return res.status(400).json({ ok: false, error: 'Message text is required' });
  if (action !== 'send_message' && !user_id)
    return res.status(400).json({ ok: false, error: 'user_id is required' });

  try {
    const r = await fetch(process.env.N8N_ACTION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.N8N_ACTION_SECRET },
      body: JSON.stringify({ action, chat_id, user_id, text, admin: user.email }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false)
      return res.status(502).json({ ok: false, error: friendlyError(body.error || body.message, body.error ? 0 : r.status) });
    return res.status(200).json({ ok: true, ...body });
  } catch {
    return res.status(502).json({ ok: false, error: 'Can’t reach the bot service (n8n). Check your internet connection and that n8n is running.' });
  }
}
