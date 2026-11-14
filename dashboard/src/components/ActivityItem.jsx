import { describeEvent, EVENT_META, timeAgo } from '../lib/format';
import { cx } from './ui';

const DOT = {
  green: 'bg-emerald-50 dark:bg-emerald-500/10',
  amber: 'bg-amber-50 dark:bg-amber-500/10',
  red: 'bg-red-50 dark:bg-red-500/10',
  gray: 'bg-slate-100 dark:bg-slate-800',
  blue: 'bg-brand-50 dark:bg-brand-500/10',
};

export function EventIcon({ type }) {
  const meta = EVENT_META[type] || { emoji: '•', tone: 'gray' };
  return (
    <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base', DOT[meta.tone])}>
      {meta.emoji}
    </div>
  );
}

export default function ActivityItem({ event, fresh }) {
  return (
    <li className={cx('flex items-start gap-3 px-5 py-3', fresh && 'animate-slide-in')}>
      <EventIcon type={event.event_type} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{describeEvent(event)}</p>
        <p className="mt-0.5 text-xs text-slate-400" title={new Date(event.created_at).toLocaleString()}>
          {timeAgo(event.created_at)}
        </p>
      </div>
    </li>
  );
}
