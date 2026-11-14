import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Ban, BarChart3, Trash2, TriangleAlert, UserCheck, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../lib/supabase';
import { useGroup } from '../lib/group';
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows } from '../components/ui';
import ActivityItem from '../components/ActivityItem';

const STATS = [
  { key: 'total_members', label: 'Members', icon: Users, color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-500' },
  { key: 'active_24h', label: 'Active (24h)', icon: UserCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { key: 'warnings_7d', label: 'Warnings (7d)', icon: TriangleAlert, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' },
  { key: 'deleted_7d', label: 'Removed (7d)', icon: Trash2, color: 'text-orange-600 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400' },
  { key: 'banned', label: 'Banned', icon: Ban, color: 'text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400' },
];

const SERIES = [
  { key: 'joins', label: 'Joins', color: '#10b981' },
  { key: 'warnings', label: 'Warnings', color: '#f59e0b' },
  { key: 'deletions', label: 'Messages removed', color: '#ef4444' },
];

function StatCard({ label, value, icon: Icon, color, loading }) {
  return (
    <Card className="p-5">
      <div className={`mb-4 inline-flex rounded-lg p-2 ${color}`}>
        <Icon size={18} />
      </div>
      {loading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-semibold tabular-nums">{value ?? 0}</p>}
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  );
}

function buildChart(rows) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ date: d, day: d.toLocaleDateString(undefined, { weekday: 'short' }), joins: 0, warnings: 0, deletions: 0 });
  }
  for (const r of rows) {
    const t = new Date(r.created_at);
    t.setHours(0, 0, 0, 0);
    const bucket = days.find((d) => d.date.getTime() === t.getTime());
    if (!bucket) continue;
    if (r.event_type === 'join') bucket.joins++;
    else if (r.event_type === 'warn') bucket.warnings++;
    else if (r.event_type === 'message_deleted') bucket.deletions++;
  }
  return days;
}

export default function Overview() {
  const { chatId, group } = useGroup();
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [feed, setFeed] = useState([]);
  const [freshIds, setFreshIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const refreshTimer = useRef();

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);
    const [s, c, f] = await Promise.all([
      supabase.from('group_stats').select('*').eq('chat_id', chatId).maybeSingle(),
      supabase.from('activity_log').select('event_type, created_at').eq('chat_id', chatId)
        .in('event_type', ['join', 'warn', 'message_deleted']).gte('created_at', since.toISOString()).limit(5000),
      supabase.from('activity_log').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(15),
    ]);
    const err = s.error || c.error || f.error;
    if (err) setError(err.message);
    else {
      setError(null);
      setStats(s.data);
      setChart(buildChart(c.data));
      setFeed(f.data);
    }
    setLoading(false);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: new activity slides into the feed; stats/chart refresh shortly after.
  useEffect(() => {
    const channel = supabase
      // unique name: React dev mode mounts twice, and a shared name lets the cleanup kill the 2nd subscription
      .channel(`overview-${chatId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `chat_id=eq.${chatId}` }, (payload) => {
        setFeed((prev) => [payload.new, ...prev.filter((e) => e.id !== payload.new.id)].slice(0, 15));
        setFreshIds((prev) => new Set(prev).add(payload.new.id));
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(load, 800);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [chatId, load]);

  // safety net: if the live connection is down, refresh every 10 seconds instead
  useEffect(() => {
    if (live) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [live, load]);

  const hasChartData = chart.some((d) => d.joins || d.warnings || d.deletions);

  return (
    <>
      <PageHeader title="Overview" description={`How ${group?.group_title || 'your group'} is doing right now.`} />

      {error ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {STATS.map((s) => (
              <StatCard key={s.key} {...s} value={stats?.[s.key]} loading={loading} />
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader icon={BarChart3} title="Last 7 days" description="Joins, warnings and removed messages per day" />
              <div className="h-72 p-4">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : !hasChartData ? (
                  <EmptyState icon={BarChart3} title="No activity yet" text="Once people join and the bot moderates messages, the chart fills in." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      {SERIES.map((s) => (
                        <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={18} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="flex flex-col lg:col-span-2">
              <CardHeader
                icon={Activity}
                title="Live activity"
                action={
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className="relative flex h-2 w-2">
                      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    </span>
                    {live ? 'Live' : 'Connecting…'}
                  </span>
                }
              />
              {loading ? (
                <SkeletonRows rows={5} />
              ) : feed.length === 0 ? (
                <EmptyState icon={Activity} title="Nothing yet" text="Events from the group show up here instantly." />
              ) : (
                <ul className="max-h-[22rem] flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {feed.map((e) => <ActivityItem key={e.id} event={e} fresh={freshIds.has(e.id)} />)}
                </ul>
              )}
              <div className="border-t border-slate-100 px-5 py-3 text-right dark:border-slate-800">
                <Link to="/activity" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-500">View all activity →</Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
