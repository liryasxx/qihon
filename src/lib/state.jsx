import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
const Context = createContext(null);
const empty = () => ({ bookmarks: [], history: [] });
function readLocal() {
  try {
    const data = JSON.parse(localStorage.getItem('qihon:guest') || 'null');
    return data && Array.isArray(data.bookmarks) && Array.isArray(data.history) ? data : empty();
  } catch { return empty(); }
}
const slim = manga => ({
  id: manga.id,
  title: manga.title,
  cover: manga.cover,
  tags: manga.tags,
  authors: manga.authors || [],
  sourceUrl: manga.sourceUrl || null,
  languages: manga.languages || [],
  readingLanguage: manga.readingLanguage || null,
});

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [data, setData] = useState(readLocal);
  const [dataOwner, setDataOwner] = useState('guest');
  const [dataLoading, setDataLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [recovery, setRecovery] = useState(false);
  const notify = useCallback(message => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) notify(error.message);
      setUser(data.session?.user || null); setAuthLoading(false);
    }).catch(() => { if (active) { setAuthLoading(false); notify('Could not restore your session. Please sign in again.'); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active) { setUser(session?.user || null); setAuthLoading(false); if (event === 'PASSWORD_RECOVERY') setRecovery(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [notify]);
  useEffect(() => {
    let active = true;
    if (!user || !supabase) { setData(readLocal()); setDataOwner('guest'); setDataLoading(false); return; }
    setData(empty()); setDataOwner(user.id); setDataLoading(true);
    Promise.all([
      supabase.from('bookmarks').select('*').order('created_at', { ascending: false }),
      supabase.from('reading_progress').select('*').order('updated_at', { ascending: false }),
    ]).then(([bookmarks, progress]) => {
      if (!active) return;
      if (bookmarks.error || progress.error) { notify('Could not load your library. Check the Supabase setup and try again.'); return; }
      setData({ bookmarks: bookmarks.data.map(b => b.manga), history: progress.data.map(p => ({ ...p.manga, chapterId: p.chapter_id, chapterNumber: p.chapter_number, page: p.page, totalPages: p.total_pages, offset: p.chapter_offset, updatedAt: p.updated_at })) });
    }).catch(() => { if (active) notify('Could not load your library. Check your connection.'); })
      .finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [user?.id, notify]);
  useEffect(() => { if (!user && dataOwner === 'guest' && !dataLoading) { try { localStorage.setItem('qihon:guest', JSON.stringify(data)); } catch { /* Reading still works when storage is full. */ } } }, [data, user, dataOwner, dataLoading]);

  const toggleBookmark = useCallback(async manga => {
    const removing = data.bookmarks.some(b => b.id === manga.id);
    if (supabase && user) {
      const result = removing ? await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('manga_id', manga.id)
        : await supabase.from('bookmarks').upsert({ user_id: user.id, manga_id: manga.id, manga: slim(manga) });
      if (result.error) { notify('Could not save your bookmark. Please try again.'); return; }
    }
    setData(previous => ({ ...previous, bookmarks: removing ? previous.bookmarks.filter(b => b.id !== manga.id) : [slim(manga), ...previous.bookmarks.filter(b => b.id !== manga.id)] }));
    notify(removing ? 'Removed from your library' : user ? 'Saved to your library' : 'Saved on this device');
  }, [data.bookmarks, user?.id, notify]);
  const saveProgress = useCallback(async (manga, progress) => {
    const saved = { ...slim(manga), ...progress, updatedAt: new Date().toISOString() };
    setData(previous => ({ ...previous, history: [saved, ...previous.history.filter(p => p.id !== manga.id)].slice(0, 100) }));
    if (supabase && user) {
      const { error } = await supabase.from('reading_progress').upsert({ user_id: user.id, manga_id: manga.id, manga: slim(manga), chapter_id: progress.chapterId, chapter_number: String(progress.chapterNumber), page: progress.page, total_pages: progress.totalPages, chapter_offset: progress.offset || 0, updated_at: saved.updatedAt });
      if (error) notify('Reading progress could not sync. Check your connection.');
    }
  }, [user?.id, notify]);
  const value = useMemo(() => ({ user, authLoading, data, dataLoading, notify, toggleBookmark, saveProgress, recovery, setRecovery }), [user, authLoading, data, dataLoading, notify, toggleBookmark, saveProgress, recovery]);
  return <Context.Provider value={value}>{children}{toast && <div className="toast" role="status">{toast}</div>}</Context.Provider>;
}
export const useApp = () => useContext(Context);
