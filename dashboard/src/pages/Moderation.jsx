import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Plus, ScrollText, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useGroup } from '../lib/group';
import { Button, Card, CardHeader, EmptyState, ErrorState, inputClass, Label, PageHeader, Skeleton, cx } from '../components/ui';
import { ConfirmModal } from '../components/Modal';

function Toggle({ checked, onChange, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700',
      )}
    >
      <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function RulesCard() {
  const { group, chatId, reload } = useGroup();
  const [welcome, setWelcome] = useState(group.welcome_message);
  const [rules, setRules] = useState(group.rules_text);
  const [saving, setSaving] = useState(false);
  const dirty = welcome !== group.welcome_message || rules !== group.rules_text;

  const save = async () => {
    if (!welcome.trim() || !rules.trim()) return toast.error('Welcome message and rules can’t be empty');
    setSaving(true);
    const { error } = await supabase.from('settings').update({ welcome_message: welcome.trim(), rules_text: rules.trim() }).eq('chat_id', chatId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Saved — the bot uses this right away');
    reload();
  };

  return (
    <Card>
      <CardHeader icon={ScrollText} title="Rules & welcome" description="What the bot says to new members and on /rules." />
      <div className="space-y-5 p-5">
        <div>
          <Label htmlFor="welcome" hint="— {name} becomes the member’s first name">Welcome message</Label>
          <textarea id="welcome" rows={3} value={welcome} onChange={(e) => setWelcome(e.target.value)} className={inputClass} maxLength={1000} />
          <p className="mt-1.5 text-xs text-slate-400">
            Preview: <span className="text-slate-600 dark:text-slate-300">{welcome.replaceAll('{name}', 'Ali')}</span>
          </p>
        </div>
        <div>
          <Label htmlFor="rules">Group rules</Label>
          <textarea id="rules" rows={5} value={rules} onChange={(e) => setRules(e.target.value)} className={inputClass} maxLength={3000} />
        </div>
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={() => { setWelcome(group.welcome_message); setRules(group.rules_text); }}>Reset</Button>}
          <Button onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
        </div>
      </div>
    </Card>
  );
}

function AutoModCard() {
  const { group, chatId, reload } = useGroup();
  const [blockLinks, setBlockLinks] = useState(group.block_links);
  const [maxWarn, setMaxWarn] = useState(group.max_warnings);
  const [muteMin, setMuteMin] = useState(group.mute_minutes);
  const [testMode, setTestMode] = useState(!!group.test_mode);
  const [saving, setSaving] = useState(false);
  const dirty =
    blockLinks !== group.block_links || Number(maxWarn) !== group.max_warnings ||
    Number(muteMin) !== group.mute_minutes || testMode !== !!group.test_mode;

  const save = async () => {
    const mw = Number(maxWarn), mm = Number(muteMin);
    if (!Number.isInteger(mw) || mw < 1 || mw > 10) return toast.error('Max warnings must be between 1 and 10');
    if (!Number.isInteger(mm) || mm < 1 || mm > 10080) return toast.error('Mute duration must be 1–10080 minutes');
    setSaving(true);
    const { error } = await supabase.from('settings')
      .update({ block_links: blockLinks, max_warnings: mw, mute_minutes: mm, test_mode: testMode }).eq('chat_id', chatId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Auto-moderation updated');
    reload();
  };

  return (
    <Card>
      <CardHeader icon={ShieldCheck} title="Auto-moderation" description="Group admins are never moderated." />
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Label htmlFor="links">Block links</Label>
            <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">Delete messages containing links and warn the sender.</p>
          </div>
          <Toggle id="links" checked={blockLinks} onChange={setBlockLinks} />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Label htmlFor="maxw">Warnings before ban</Label>
            <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">The member is banned automatically at this count.</p>
          </div>
          <input id="maxw" type="number" min={1} max={10} value={maxWarn} onChange={(e) => setMaxWarn(e.target.value)} className={inputClass + ' w-20 text-center'} />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <Label htmlFor="mute">Mute duration</Label>
            <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">Minutes, used by /mute and the Mute button.</p>
          </div>
          <input id="mute" type="number" min={1} max={10080} value={muteMin} onChange={(e) => setMuteMin(e.target.value)} className={inputClass + ' w-24 text-center'} />
        </div>
        <div className={cx('flex items-center justify-between gap-4 px-5 py-4', testMode && 'bg-amber-50 dark:bg-amber-500/10')}>
          <div>
            <Label htmlFor="testmode">Test mode</Label>
            <p className="-mt-1 text-sm text-slate-500 dark:text-slate-400">
              Moderate admins too, so you can test with your own account. Telegram never lets bots ban the group owner,
              so at the limit the bot resets warnings instead. Turn off before going live.
            </p>
          </div>
          <Toggle id="testmode" checked={testMode} onChange={setTestMode} />
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 p-4 dark:border-slate-800">
        <Button onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
      </div>
    </Card>
  );
}

function BannedWordsCard() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('banned_words').select('*').order('word');
    if (error) setError(error.message);
    else { setError(null); setWords(data); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const word = input.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!word) return;
    if (words.some((w) => w.word === word)) return toast.error(`“${word}” is already on the list`);
    setAdding(true);
    const { error } = await supabase.from('banned_words').insert({ word });
    setAdding(false);
    if (error) return toast.error(error.message);
    setInput('');
    toast.success(`Added “${word}”`);
    load();
  };

  const remove = async () => {
    setDeleting(true);
    const { error } = await supabase.from('banned_words').delete().eq('id', toDelete.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success(`Removed “${toDelete.word}”`);
    setToDelete(null);
    load();
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader icon={Ban} title="Banned words" description="Messages containing any of these are deleted and the sender is warned." />
      <div className="p-5">
        <form onSubmit={add} className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add a word or phrase…" className={inputClass} maxLength={60} />
          <Button type="submit" loading={adding} disabled={!input.trim()}><Plus size={16} /> Add</Button>
        </form>
        <div className="mt-4">
          {loading ? (
            <div className="flex flex-wrap gap-2">{[60, 80, 50, 90].map((w) => <Skeleton key={w} className="h-8" style={{ width: w }} />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : words.length === 0 ? (
            <EmptyState icon={Ban} title="No banned words" text="Add words above to start filtering messages." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {words.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-sm dark:border-slate-700 dark:bg-slate-800">
                  {w.word}
                  <button onClick={() => setToDelete(w)} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700" aria-label={`Remove ${w.word}`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        danger
        title="Remove banned word?"
        message={toDelete && `Messages containing “${toDelete.word}” will no longer be deleted.`}
        confirmLabel="Remove"
      />
    </Card>
  );
}

export default function Moderation() {
  const { group } = useGroup();
  return (
    <>
      <PageHeader title="Moderation" description="Control how the bot greets people and keeps the group clean." />
      {/* key resets the forms when switching groups */}
      <div key={group.chat_id} className="grid gap-6 lg:grid-cols-2">
        <RulesCard />
        <AutoModCard />
        <BannedWordsCard />
      </div>
    </>
  );
}
