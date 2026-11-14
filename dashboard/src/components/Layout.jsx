import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, LayoutDashboard, LogOut, Megaphone, Menu, Moon, Send, ShieldCheck, Sun, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useGroup } from '../lib/group';
import { EmptyState, ErrorState, Skeleton, cx } from './ui';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/moderation', label: 'Moderation', icon: ShieldCheck },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/activity', label: 'Activity', icon: Activity },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  };
  return [dark, toggle];
}

function Sidebar({ onNavigate }) {
  const { session } = useAuth();
  const { groups, group, setChatId } = useGroup();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
          <Send size={18} className="-ml-0.5" />
        </div>
        <div>
          <p className="font-semibold leading-tight">Group Manager</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Telegram admin</p>
        </div>
      </div>

      {group && (
        <div className="mx-3 mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Group</p>
          {groups.length > 1 ? (
            <select
              value={group.chat_id}
              onChange={(e) => setChatId(e.target.value)}
              className="mt-0.5 w-full truncate bg-transparent text-sm font-medium focus:outline-none"
            >
              {groups.map((g) => (
                <option key={g.chat_id} value={g.chat_id}>{g.group_title || g.chat_id}</option>
              ))}
            </select>
          ) : (
            <p className="mt-0.5 truncate text-sm font-medium">{group.group_title || group.chat_id}</p>
          )}
          {group.test_mode && (
            <p className="mt-1.5 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              🧪 Test mode on
            </p>
          )}
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-500'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <p className="truncate px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">{session?.user?.email}</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <LogOut size={18} /> Log out
        </button>
      </div>
    </div>
  );
}

function NoGroupYet() {
  return (
    <EmptyState
      icon={Send}
      title="Waiting for the bot"
      text="No group connected yet. Add the bot to your Telegram group as an admin and send any message there — the group will appear here automatically."
    />
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, toggleTheme] = useTheme();
  const { group, loading, error, reload } = useGroup();
  const location = useLocation();
  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:block dark:border-slate-800 dark:bg-slate-900">
        <Sidebar />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="h-full w-72 border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="absolute left-60 top-5 rounded-md p-1 text-slate-400" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-8 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className="font-semibold">{current?.label}</span>
          </div>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Toggle dark mode"
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : !group ? (
              <NoGroupYet />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
