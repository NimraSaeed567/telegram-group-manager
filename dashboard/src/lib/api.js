import { toast } from 'sonner';
import { supabase } from './supabase';

const SUCCESS = {
  ban: 'Member banned',
  unban: 'Member unbanned',
  mute: 'Member muted',
  unmute: 'Member unmuted',
  send_message: 'Message sent to the group',
};

const LABEL = {
  ban: 'ban this member',
  unban: 'unban this member',
  mute: 'mute this member',
  unmute: 'unmute this member',
  send_message: 'send the message',
};

/** Calls the Vercel function (which calls n8n). Shows a toast. Returns true on success. */
export async function runAction(action, payload) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let r;
  try {
    r = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    toast.error('Couldn’t reach the server', { description: 'Check your internet connection and try again.' });
    return false;
  }
  const body = await r.json().catch(() => ({}));
  if (r.ok && body.ok !== false) {
    toast.success(SUCCESS[action] || 'Done');
    return true;
  }
  const message =
    r.status === 401 ? 'Your session expired. Please log in again.'
    : body.error || 'Something went wrong. Please try again.';
  toast.error(`Couldn’t ${LABEL[action] || 'do that'}`, { description: message });
  return false;
}
