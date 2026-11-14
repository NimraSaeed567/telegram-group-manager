import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGroup } from '../lib/group';
import { describeEvent, EVENT_META, formatDateTime } from '../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, inputClass, PageHeader, SkeletonRows } from '../components/ui';
import { EventIcon } from '../components/ActivityItem';

const PAGE = 25;

export default function ActivityPage() {
  const { chatId } = useGroup();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const [freshIds, setFreshIds] = useState(new Set());

  // quiet = background refresh, no loading skeleton
  const load = useCallback(async (quiet) => {
    if (quiet !== true) setLoading(true);
    let q = supabase.from('activity_log').select('*', { count: 'exact' }).eq('chat_id', chatId)
      .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (type !== 'all') q = q.eq('event_type', type);
    if (from) q = q.gte('created_at', new Date(from + 'T00:00:00').toISOString());
    if (to) q = q.lte('created_at', new Date(to + 'T23:59:59.999').toISOString());
    const { data, error, count } = await q;
    if (error) setError(error.message);
    else { setError(null); setRows(data); setTotal(count || 0); }
    setLoading(false);
  }, [chatId, page, type, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [type, from, to]);

  // live updates: new events slide in at the top of page 1 (when they match the filters)
  useEffect(() => {
    const ch = supabase
      .channel(`activity-${chatId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `chat_id=eq.${chatId}` }, ({ new: e }) => {
        const matches = (type === 'all' || e.event_type === type) && !to;
        if (!matches) return;
        setTotal((t) => t + 1);
        if (page !== 0) return;
        setRows((prev) => [e, ...prev.filter((r) => r.id !== e.id)].slice(0, PAGE));
        setFreshIds((prev) => new Set(prev).add(e.id));
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(ch); };
  }, [chatId, type, to, page]);

  // safety net: if the live connection is down, refresh quietly every 10 seconds
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => load(true), 10000);
    return () => clearInterval(t);
  }, [live, load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = type !== 'all' || from || to;

  return (
    <>
      <PageHeader
        title="Activity"
        description="Everything the bot and admins have done, newest first."
        action={
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {live ? 'Live' : 'Auto-refresh'}
          </span>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center dark:border-slate-800">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass + ' sm:max-w-xs'} aria-label="Event type">
            <option value="all">All events</option>
            {Object.entries(EVENT_META).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} aria-label="From date" />
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} aria-label="To date" />
          {filtered ? (
            <Button variant="ghost" onClick={() => { setType('all'); setFrom(''); setTo(''); }}>Clear</Button>
          ) : <span />}
        </div>

        {loading ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ActivityIcon} title={filtered ? 'No events match these filters' : 'No activity yet'}
            text={filtered ? 'Try another event type or date range.' : 'Joins, warnings, bans and announcements will be logged here.'} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((e) => {
              const meta = EVENT_META[e.event_type];
              return (
                <li key={e.id} className={`flex items-start gap-3 px-5 py-3 ${freshIds.has(e.id) ? 'animate-slide-in' : ''}`}>
                  <EventIcon type={e.event_type} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm">{describeEvent(e)}</p>
                    {e.event_type === 'message_deleted' && e.details?.text && (
                      <p className="mt-1 truncate text-xs text-slate-400">“{e.details.text}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
                    <span className="text-xs text-slate-400">{formatDateTime(e.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">{total} event{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={page === 0 || loading} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft size={16} />
            </Button>
            <span className="tabular-nums text-slate-500">{page + 1} / {pages}</span>
            <Button size="sm" variant="secondary" disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
