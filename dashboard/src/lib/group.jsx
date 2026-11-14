import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

// The bot creates one `settings` row per Telegram group it is in.
// This context loads those rows and remembers which group the admin is viewing.
const GroupContext = createContext(null);

export function GroupProvider({ children }) {
  const [groups, setGroups] = useState([]);
  const [chatId, setChatIdState] = useState(() => {
    try { return localStorage.getItem('chatId'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('settings').select('*').order('updated_at', { ascending: false });
    if (error) setError(error.message);
    else {
      setError(null);
      setGroups(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setChatId = (id) => {
    setChatIdState(String(id));
    try { localStorage.setItem('chatId', String(id)); } catch {}
  };

  const group = groups.find((g) => String(g.chat_id) === String(chatId)) || groups[0] || null;

  return (
    <GroupContext.Provider value={{ groups, group, chatId: group?.chat_id ?? null, setChatId, loading, error, reload }}>
      {children}
    </GroupContext.Provider>
  );
}

export const useGroup = () => useContext(GroupContext);
