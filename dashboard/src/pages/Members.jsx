import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Ban, MessageSquare, Search, ShieldCheck, TriangleAlert, Undo2, Users, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGroup } from '../lib/group';
import { runAction } from '../lib/api';
import { formatDate, formatDateTime, memberName, timeAgo } from '../lib/format';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorState, inputClass, PageHeader, SkeletonRows, StatusBadge, cx,
} from '../components/ui';
import { ConfirmModal } from '../components/Modal';
import { Drawer } from '../components/Drawer';

const TABS = ['all', 'active', 'muted', 'banned', 'left'];

const ACTIONS = {
  mute:   { label: 'Mute',   icon: VolumeX, danger: false, title: 'Mute member?',  msg: (n, s) => `${n} won't be able to send messages for ${s.mute_minutes} minutes.` },
  unmute: { label: 'Unmute', icon: Volume2, danger: false, title: 'Unmute member?', msg: (n) => `${n} will be able to send messages again.` },
  ban:    { label: 'Ban',    icon: Ban,     danger: true,  title: 'Ban member?',    msg: (n) => `${n} will be removed from the group and can't rejoin until unbanned.` },
  unban:  { label: 'Unban',  icon: Undo2,   danger: false, title: 'Unban member?',  msg: (n) => `${n} will be allowed to rejoin the group. Their warnings will be reset to 0.` },
};

function actionsFor(status) {
  if (status === 'active') return ['mute', 'ban'];
  if (status === 'muted') return ['unmute', 'ban'];
  if (status === 'banned') return ['unban'];
  return [];
}

function WarningHistory({ member, chatId, maxWarnings }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    supabase.from('warnings').select('*').eq('chat_id', chatId).eq('user_id', member.user_id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) setError(error.message);
        else setRows(data);
      });
    return () => { cancel = true; };
  }, [member.user_id, chatId]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 border-b border-slate-100 p-5 dark:border-slate-800">
        <div><p className="text-xs text-slate-500">Status</p><div className="mt-1"><StatusBadge status={member.status} /></div></div>
        <div><p className="text-xs text-slate-500">Warnings</p><p className="mt-1 font-semibold">{member.warning_count}/{maxWarnings}</p></div>
        <div><p className="text-xs text-slate-500">Messages</p><p className="mt-1 font-semibold">{member.message_count}</p></div>
        <div className="col-span-3 grid grid-cols-2 gap-3">
          <div><p className="text-xs text-slate-500">Joined</p><p className="mt-1 text-sm">{formatDate(member.joined_at)}</p></div>
          <div><p className="text-xs text-slate-500">Last seen</p><p className="mt-1 text-sm">{timeAgo(member.last_seen)}</p></div>
        </div>
      </div>
      <h4 className="px-5 pt-5 text-sm font-semibold">Warning history</h4>
      {error ? (
        <ErrorState message={error} />
      ) : !rows ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No warnings" text="This member has a clean record." />
      ) : (
        <ol className="space-y-3 p-5">
          {rows.map((w) => (
            <li key={w.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{w.reason}</p>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(w.created_at)}</span>
              </div>
              {w.message_text && (
                <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  “{w.message_text}”
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">Issued by {w.issued_by === 'bot' ? 'the bot (automatic)' : w.issued_by}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function Members() {
  const { chatId, group } = useGroup();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('last_seen');
  const [pending, setPending] = useState(null); // { action, member }
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('members').select('*').eq('chat_id', chatId).limit(1000);
    if (error) setError(error.message);
    else { setError(null); setMembers(data); }
    setLoading(false);
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  // keep the table in sync when the bot changes a member
  useEffect(() => {
    const ch = supabase
      .channel(`members-${chatId}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `chat_id=eq.${chatId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chatId, load]);

  const counts = useMemo(() => {
    const c = { all: members.length };
    for (const m of members) c[m.status] = (c[m.status] || 0) + 1;
    return c;
  }, [members]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    return members
      .filter((m) => tab === 'all' || m.status === tab)
      .filter((m) => !q || (m.first_name || '').toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q))
      .sort((a, b) =>
        sort === 'warnings'
          ? b.warning_count - a.warning_count || new Date(b.last_seen) - new Date(a.last_seen)
          : new Date(b.last_seen) - new Date(a.last_seen),
      );
  }, [members, tab, query, sort]);

  const confirm = async () => {
    setRunning(true);
    const ok = await runAction(pending.action, { chat_id: chatId, user_id: pending.member.user_id });
    setRunning(false);
    if (ok) {
      setPending(null);
      load();
    }
  };

  const max = group?.max_warnings ?? 3;

  return (
    <>
      <PageHeader title="Members" description="Everyone the bot has seen in the group. Click a member to see their warnings." />

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  tab === t ? 'bg-white shadow-sm dark:bg-slate-900' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                {t} <span className="ml-1 text-xs text-slate-400">{counts[t] || 0}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or @username"
                className={inputClass + ' pl-9'} />
            </div>
            <Button variant="secondary" onClick={() => setSort(sort === 'warnings' ? 'last_seen' : 'warnings')} title="Change sort order">
              <ArrowDownUp size={16} />
              <span className="hidden sm:inline">{sort === 'warnings' ? 'Most warnings' : 'Recently active'}</span>
            </Button>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={members.length === 0 ? 'No members yet' : 'No matches'}
            text={members.length === 0 ? 'Members appear here as soon as they join or send a message.' : 'Try a different search or filter.'}
            action={members.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => { setQuery(''); setTab('all'); }}>Clear filters</Button>
            )}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Warnings</th>
                  <th className="hidden px-3 py-3 md:table-cell">Messages</th>
                  <th className="hidden px-3 py-3 sm:table-cell">Last seen</th>
                  <th className="hidden px-3 py-3 lg:table-cell">Joined</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((m) => (
                  <tr key={m.id} onClick={() => setSelected(m)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={memberName(m)} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{memberName(m)}</p>
                          <p className="truncate text-xs text-slate-400">{m.username ? '@' + m.username : `ID ${m.user_id}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-3 py-3">
                      <Badge tone={m.warning_count === 0 ? 'gray' : m.warning_count >= max - 1 ? 'red' : 'amber'}>
                        <TriangleAlert size={12} /> {m.warning_count}/{max}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-3 tabular-nums md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <MessageSquare size={14} className="text-slate-400" /> {m.message_count}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">{timeAgo(m.last_seen)}</td>
                    <td className="hidden px-3 py-3 text-slate-500 lg:table-cell">{formatDate(m.joined_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {actionsFor(m.status).map((a) => {
                          const A = ACTIONS[a];
                          return (
                            <Button key={a} size="sm" variant={A.danger ? 'danger' : 'secondary'} onClick={() => setPending({ action: a, member: m })}>
                              <A.icon size={14} /> <span className="hidden sm:inline">{A.label}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        loading={running}
        danger={pending && ACTIONS[pending.action].danger}
        title={pending && ACTIONS[pending.action].title}
        message={pending && ACTIONS[pending.action].msg(memberName(pending.member), group)}
        confirmLabel={pending && ACTIONS[pending.action].label}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected && memberName(selected)}
        subtitle={selected && (selected.username ? '@' + selected.username : `ID ${selected.user_id}`)}
      >
        {selected && <WarningHistory member={selected} chatId={chatId} maxWarnings={max} />}
      </Drawer>
    </>
  );
}
