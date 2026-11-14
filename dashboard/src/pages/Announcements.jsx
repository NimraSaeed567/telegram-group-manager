import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Clock, History, Megaphone, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGroup } from '../lib/group';
import { runAction } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, inputClass, Label, PageHeader, SkeletonRows } from '../components/ui';
import { ConfirmModal } from '../components/Modal';

const MAX = 4000; // Telegram message limit is 4096

// value for <input type="datetime-local"> in local time
function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Announcements() {
  const { chatId } = useGroup();
  const [text, setText] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 10 * 60000)));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scheduling, setScheduling] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('announcements').select('*').eq('chat_id', chatId)
      .order('scheduled_at', { ascending: false }).limit(100);
    if (error) setError(error.message);
    else { setError(null); setItems(data); }
    setLoading(false);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  // refresh every 30s so pending items flip to "sent" without a reload
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const schedule = async () => {
    const date = new Date(when);
    if (!text.trim()) return toast.error('Write a message first');
    if (isNaN(date) || date <= new Date()) return toast.error('Pick a time in the future');
    setScheduling(true);
    const { error } = await supabase.from('announcements').insert({ chat_id: chatId, text: text.trim(), scheduled_at: date.toISOString() });
    setScheduling(false);
    if (error) return toast.error(error.message);
    toast.success(`Scheduled for ${formatDateTime(date)}`);
    setText('');
    load();
  };

  const sendNow = async () => {
    setSending(true);
    const ok = await runAction('send_message', { chat_id: chatId, text: text.trim() });
    setSending(false);
    setConfirmSend(false);
    if (ok) setText('');
  };

  const remove = async () => {
    setDeleting(true);
    const { error } = await supabase.from('announcements').delete().eq('id', toDelete.id).eq('status', 'pending');
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success('Announcement cancelled');
    setToDelete(null);
    load();
  };

  const upcoming = items.filter((a) => a.status === 'pending').sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const history = items.filter((a) => a.status !== 'pending').sort((a, b) => new Date(b.sent_at || b.scheduled_at) - new Date(a.sent_at || a.scheduled_at));

  return (
    <>
      <PageHeader title="Announcements" description="Post to the group now, or schedule a message for later." />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="h-fit lg:col-span-2">
          <CardHeader icon={Megaphone} title="New announcement" />
          <div className="space-y-4 p-5">
            <div>
              <Label htmlFor="msg">Message</Label>
              <textarea id="msg" rows={6} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)}
                placeholder="e.g. 📢 Weekly call starts in 1 hour!" className={inputClass} />
              <p className={`mt-1 text-right text-xs ${text.length > MAX - 200 ? 'text-amber-600' : 'text-slate-400'}`}>{text.length}/{MAX}</p>
            </div>
            <div>
              <Label htmlFor="when">Send at</Label>
              <input id="when" type="datetime-local" value={when} min={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={schedule} loading={scheduling} disabled={!text.trim()}>
                <CalendarClock size={16} /> Schedule
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmSend(true)} disabled={!text.trim() || sending}>
                <Send size={16} /> Send now
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader icon={Clock} title="Upcoming" description="Checked every minute and posted on time." />
            {loading ? <SkeletonRows rows={2} /> : error ? <ErrorState message={error} onRetry={load} /> : upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing scheduled" text="Scheduled announcements will wait here until they’re posted." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm">{a.text}</p>
                      <p className="mt-1.5 text-xs text-slate-400">{formatDateTime(a.scheduled_at)} · {timeAgo(a.scheduled_at)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(a)} aria-label="Cancel announcement">
                      <Trash2 size={16} className="text-red-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={History} title="History" />
            {loading ? <SkeletonRows rows={3} /> : error ? null : history.length === 0 ? (
              <EmptyState icon={History} title="No announcements sent yet" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((a) => (
                  <li key={a.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{a.text}</p>
                      <Badge tone={a.status === 'sent' ? 'green' : 'red'}>{a.status === 'sent' ? 'Sent' : 'Failed'}</Badge>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      {a.status === 'sent' ? `Sent ${formatDateTime(a.sent_at)}` : `Failed at ${formatDateTime(a.scheduled_at)}`}
                      {a.error && <span className="text-red-500"> — {a.error}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={sendNow}
        loading={sending}
        title="Send to the group now?"
        message="The message will be posted to the Telegram group immediately."
        confirmLabel="Send now"
      />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        danger
        title="Cancel this announcement?"
        message="It will be deleted and won’t be posted."
        confirmLabel="Delete"
      />
    </>
  );
}
