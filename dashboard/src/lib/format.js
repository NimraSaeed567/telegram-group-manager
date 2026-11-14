export function timeAgo(date) {
  if (!date) return '—';
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 0) return 'in ' + timeUntil(date);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return formatDate(date);
}

function timeUntil(date) {
  const m = Math.round((new Date(date).getTime() - Date.now()) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function memberName(m) {
  if (!m) return 'Unknown';
  return m.first_name || (m.username ? '@' + m.username : `User ${m.user_id}`);
}

export const EVENT_META = {
  join:            { label: 'Joined',          emoji: '👋', tone: 'green' },
  leave:           { label: 'Left',            emoji: '🚪', tone: 'gray' },
  message_deleted: { label: 'Message removed', emoji: '🗑', tone: 'amber' },
  warn:            { label: 'Warning',         emoji: '⚠️', tone: 'amber' },
  ban:             { label: 'Banned',          emoji: '🚫', tone: 'red' },
  unban:           { label: 'Unbanned',        emoji: '✅', tone: 'green' },
  mute:            { label: 'Muted',           emoji: '🔇', tone: 'amber' },
  unmute:          { label: 'Unmuted',         emoji: '🔊', tone: 'green' },
  command:         { label: 'Command',         emoji: '⌨️', tone: 'blue' },
  announcement:    { label: 'Announcement',    emoji: '📣', tone: 'blue' },
  error:           { label: 'Error',           emoji: '❗', tone: 'red' },
};

/** Human-readable sentence for an activity_log row. */
export function describeEvent(e) {
  const d = e.details || {};
  const who = e.username || (e.user_id ? `User ${e.user_id}` : 'Someone');
  const by = d.by && d.by !== 'bot' ? ` by ${d.by}` : d.by === 'bot' ? ' by the bot' : '';
  switch (e.event_type) {
    case 'join': return `${who} joined the group`;
    case 'leave': return `${who} left the group`;
    case 'message_deleted': return `Message from ${who} removed — ${d.reason || 'rule violation'}`;
    case 'warn': return `${who} warned${d.count ? ` (${d.count}${d.max ? '/' + d.max : ''})` : ''} — ${d.reason || 'no reason'}`;
    case 'ban': return `${who} was banned${by}${d.reason ? ' — ' + d.reason : ''}`;
    case 'unban': return `${who} was unbanned${by}`;
    case 'mute': return `${who} was muted${by}${d.minutes ? ` for ${d.minutes} min` : ''}`;
    case 'unmute': return `${who} was unmuted${by}`;
    case 'command': return `${who} used ${d.command || 'a command'}`;
    case 'announcement': return `Announcement posted${by}${d.text ? ': “' + truncate(d.text, 60) + '”' : ''}`;
    case 'error': return `Error: ${d.message || d.error || 'unknown'}`;
    default: return `${who}: ${e.event_type}`;
  }
}

export function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
