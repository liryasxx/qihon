import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { content, plainText } from './lib/api';
import { supabase, useApp } from './lib/state';
import Icon from './components/Icon';
import { Attribution, Cover, Empty, ErrorState, Loading, MangaCard } from './components/UI';
import ProfilePhoto from './components/ProfilePhoto';
import HeaderAvatar from './components/HeaderAvatar';

import {
  ReadingLibrary,
  ReadingScreen,
} from './components/ReadingFeatures';

import ManhwaDetails from './components/ManhwaDetails';

import {
  NotificationBell,
  NotificationsPage,
  CheckoutPage,
  DiamondWalletCard,
} from './components/QihonExtras';

function useResource(loader, deps) {
  const [state, setState] = useState({ loading: true, value: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, value: null, error: '' });
    loader(controller.signal).then(value => { if (!controller.signal.aborted) setState({ loading: false, value, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, value: null, error: error.message }); });
    return () => controller.abort();
  }, [...deps, attempt]);
  return { ...state, retry: () => setAttempt(n => n + 1) };
}
const navItems = [['/', 'home', 'Home'], ['/browse', 'compass', 'Browse'], ['/library', 'book', 'Library'], ['/profile', 'user', 'Profile']];
function Navigation({ className = '' }) {
  return <nav className={className} aria-label="Main navigation">{navItems.map(([to, icon, name]) => <NavLink key={to} to={to} end={to === '/'}><Icon name={icon}/><span>{name}</span></NavLink>)}</nav>;
}
function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand" aria-label="Qihon home">
          <span className="brand-mark">
            <Icon name="book" size={25} />
          </span>
          <span>Qihon</span>
        </Link>

        <Navigation className="desktop-nav" />

        <div className="header-actions">
          <NotificationBell />
          <HeaderAvatar />
        </div>
      </div>
    </header>
  );
}
function PwaPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => {
    const before = event => { event.preventDefault(); setInstallEvent(event); };
    const installed = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', installed); };
  }, []);
  if (needRefresh) return <div className="pwa-banner" role="status"><span>A new Qihon version is ready.</span><button onClick={() => updateServiceWorker(true)}>Update</button><button className="icon-button" aria-label="Dismiss update" onClick={() => setNeedRefresh(false)}><Icon name="close" size={18}/></button></div>;
  if (!installEvent || dismissed) return null;
  return <div className="pwa-banner"><Icon name="download"/><span>Keep Qihon on your home screen.</span><button onClick={async () => { await installEvent.prompt(); setInstallEvent(null); }}>Install</button><button className="icon-button" aria-label="Dismiss installation" onClick={() => setDismissed(true)}><Icon name="close" size={18}/></button></div>;
}
function SearchBox({ initial = '', onSearch, showFilter, onFilter }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  return <div className="search-row"><form className="search" role="search" onSubmit={e => { e.preventDefault(); onSearch(text.trim()); }}><Icon name="search"/><input aria-label="Search manhwa titles" placeholder="Search manhwa titles…" value={text} onChange={e => setText(e.target.value)}/><button type="submit" aria-label="Submit search"><Icon name="chevron" size={18}/></button></form>{showFilter && <button className="filter-button" aria-label="Show filters" onClick={onFilter}><Icon name="filter"/></button>}</div>;
}
function SectionTitle({ title, to, action = 'See all' }) { return <div className="section-title"><h2>{title}</h2>{to && <Link to={to}>{action}</Link>}</div>; }
function ResumeCard({ manga, history }) {
  const { toggleBookmark, data } = useApp();
  const saved = data.bookmarks.some(b => b.id === manga.id);
  const readTo = history ? `/read/${history.chapterId}?offset=${history.offset || 0}` : `/title/${manga.id}`;
  const progress = history ? Math.round((history.page + 1) / history.totalPages * 100) : 0;
  return <article className="hero"><Cover manga={manga} eager className="hero-backdrop"/><div className="hero-shade"/><div className="hero-content"><Cover manga={manga} eager className="hero-cover"/><div className="hero-copy"><span className="eyebrow">{manga.tags?.slice(0, 2).map(t => t.name).join(' · ') || 'Discover a new story'}</span><h2>{manga.title}</h2><p>{history ? `Chapter ${history.chapterNumber} · Page ${history.page + 1} of ${history.totalPages}` : 'English chapters · Ready to read'}</p>{history && <div className="progress-track"><span style={{ width: `${progress}%` }}/></div>}</div></div><div className="hero-buttons"><Link className="button primary" to={readTo}><Icon name="play" size={17}/>Read Now</Link><button className={`button square ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove bookmark' : 'Bookmark manhwa'} onClick={() => toggleBookmark(manga)}><Icon name={saved ? 'check' : 'bookmark'}/></button></div></article>;
}
function Home() {
  const navigate = useNavigate();
  const { data } = useApp();
  const result = useResource(signal => content('catalog', {}, signal), []);
  const latest = useResource(signal => content('catalog', { sort: 'latest' }, signal), []);
  return <main className="page home-page"><SearchBox onSearch={q => navigate(`/browse?q=${encodeURIComponent(q)}`)} showFilter onFilter={() => navigate('/browse?filters=1')}/>
    <h1 className="sr-only">Qihon Home</h1>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error} retry={result.retry}/> : result.value.items.length ? <>
      <SectionTitle title={data.history[0] ? 'Continue Reading' : 'Discover a Story'}/><ResumeCard manga={data.history[0] || result.value.items[0]} history={data.history[0]}/>
      <Link className="discover-banner" to="/browse"><span className="banner-icon"><Icon name="compass" size={24}/></span><div><h2>Explore Manhwa</h2><p>Find your next chapter.</p></div><span className="banner-action">Browse</span></Link>
      <section><SectionTitle title="Trending Now" to="/browse"/><div className="horizontal-shelf">{result.value.items.slice(0, 8).map((manga, index) => <MangaCard key={manga.id} manga={manga} rank={index + 1}/>)}</div></section>
      <section><SectionTitle title="Recently Updated" to="/browse?sort=latest"/>{latest.loading ? <Loading text="Checking the latest chapters…"/> : latest.error ? <ErrorState message={latest.error} retry={latest.retry}/> : <div className="seasonal-list">{latest.value.items.slice(0, 4).map(manga => <Link className="seasonal-card" key={manga.id} to={`/title/${manga.id}`}><Cover manga={manga}/><div><span className="pill">{manga.tags[0]?.name || 'Manhwa'}</span><h3>{manga.title}</h3><p>{manga.authors[0] || 'English chapters available'}</p></div><Icon name="chevron" size={18}/></Link>)}</div>}</section>
    </> : <Empty title="No stories available right now" text="Try browsing again in a moment."/>}<Attribution/>
  </main>;
}
function Browse() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '', offset = Number(params.get('offset') || 0), sort = params.get('sort') || 'popular';
  const [filters, setFilters] = useState(params.has('filters'));
  const result = useResource(signal => content('catalog', { q: query, offset, sort }, signal), [query, offset, sort]);
  function update(values) { const next = new URLSearchParams(params); for (const [k, v] of Object.entries(values)) v === '' ? next.delete(k) : next.set(k, v); next.delete('filters'); setParams(next); }
  return <main className="page"><div className="page-heading"><span className="eyebrow">Find your next favorite</span><h1>Browse Manhwa</h1><p>Stories from Korea. Chapters in English.</p></div><SearchBox initial={query} onSearch={q => update({ q, offset: '0' })} showFilter onFilter={() => setFilters(!filters)}/>
    {filters && <div className="filter-panel"><label>Sort by<select value={sort} onChange={e => update({ sort: e.target.value, offset: '0' })}><option value="popular">Most followed</option><option value="latest">Recently updated</option></select></label><p><Icon name="globe" size={16}/> English chapters · Korean originals · Safe content rating</p></div>}
    <div className="browse-meta"><h2>{query ? `Results for “${query}”` : sort === 'latest' ? 'Recently updated' : 'Popular stories'}</h2><span>English</span></div>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error} retry={result.retry}/> : !result.value.items.length ? <Empty title="No matching stories" text="Try another title or a shorter search." action="Clear search"/> : <><div className="manga-grid">{result.value.items.map(m => <MangaCard key={m.id} manga={m}/>)}</div><div className="pagination"><button className="button secondary" disabled={offset <= 0} onClick={() => { update({ offset: String(Math.max(0, offset - 20)) }); window.scrollTo(0, 0); }}>Previous</button><span>Page {Math.floor(offset / 20) + 1}</span><button className="button secondary" disabled={offset + 20 >= Math.min(result.value.total, 10000)} onClick={() => { update({ offset: String(offset + 20) }); window.scrollTo(0, 0); }}>Next</button></div></>}
    <Attribution/>
  </main>;
}
function Details() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const offset = Number(params.get('offset') || 0);
  const { data, toggleBookmark, dataLoading } = useApp();
  const manga = useResource(signal => content('manga', { id }, signal), [id]);
  const chapters = useResource(signal => content('chapters', { id, offset }, signal), [id, offset]);
  const [expanded, setExpanded] = useState(false);
  const progress = data.history.find(m => m.id === id);
  const saved = data.bookmarks.some(m => m.id === id);
  if (manga.loading) return <main className="page"><Loading text="Opening this story…"/></main>;
  if (manga.error) return <main className="page"><ErrorState message={manga.error} retry={manga.retry}/></main>;
  const m = manga.value;
  return <main className="page details-page"><Link className="back-link" to="/browse"><Icon name="back" size={20}/>Browse</Link><section className="detail-hero"><Cover manga={m} eager/><div><span className="eyebrow">Manhwa · English</span><h1>{m.title}</h1><p className="muted">{m.authors.join(' & ') || 'Author information unavailable'}</p><div className="tag-list">{m.tags.slice(0, 5).map(t => <span className="pill" key={t.id}>{t.name}</span>)}</div><p className="status-line"><span className="status-dot"/>{m.status?.replaceAll('_', ' ')}{m.year ? ` · ${m.year}` : ''}</p></div></section>
    <div className="detail-actions">{progress ? <Link className="button primary" to={`/read/${progress.chapterId}?offset=${progress.offset || 0}`}><Icon name="play" size={17}/>Resume chapter {progress.chapterNumber}</Link> : chapters.value?.items[0] ? <Link className="button primary" to={`/read/${chapters.value.items[0].id}?offset=${offset}`}><Icon name="play" size={17}/>Read chapter {chapters.value.items[0].number}</Link> : <button className="button primary" disabled>Choose a chapter below</button>}<button disabled={dataLoading} className={`button secondary ${saved ? 'is-saved' : ''}`} onClick={() => toggleBookmark(m)}><Icon name={saved ? 'check' : 'bookmark'} size={18}/>{saved ? 'Saved' : 'Bookmark'}</button></div>
    <section className="synopsis"><h2>Synopsis</h2><p className={expanded ? '' : 'clamped'}>{plainText(m.description) || 'No English synopsis is available for this story yet.'}</p>{m.description.length > 240 && <button className="text-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read more'}</button>}</section>
    <section className="chapters-section"><SectionTitle title="Chapters"/><p className="muted chapter-note">English translations · Source availability may change</p>{chapters.loading ? <Loading text="Finding English chapters…"/> : chapters.error ? <ErrorState message={chapters.error} retry={chapters.retry}/> : !chapters.value.items.length ? <div className="notice">No readable English chapters are currently available for this title. Try another story.</div> : <><div className="chapter-list">{chapters.value.items.map(c => <Link key={c.id} className={`chapter-row ${progress?.chapterId === c.id ? 'current-chapter' : ''}`} to={`/read/${c.id}?offset=${offset}`}><div><h3>Chapter {c.number}{c.title ? ` · ${c.title}` : ''}</h3><p>{c.groups.map(g => g.name).join(', ') || 'Community translation'} · {c.pages} pages</p></div><Icon name={progress?.chapterId === c.id ? 'play' : 'chevron'} size={18}/></Link>)}</div><div className="pagination"><button className="button secondary" disabled={offset === 0} onClick={() => setParams({ offset: String(Math.max(0, offset - 100)) })}>Previous</button><span>{offset + 1}–{offset + chapters.value.items.length}</span><button className="button secondary" disabled={offset + 100 >= Math.min(chapters.value.total, 10000)} onClick={() => setParams({ offset: String(offset + 100) })}>More chapters</button></div></> }</section><Attribution/>
  </main>;
}
function Library() {
  const { data, dataLoading, user } = useApp();
  const [tab, setTab] = useState('bookmarks');
  return <main className="page"><div className="page-heading"><span className="eyebrow">A place for your stories</span><h1>Your Library</h1><p>{user ? 'Your collection, wherever you read.' : 'Saved on this device. Sign in to keep a separate cloud library.'}</p></div><div className="tabs" role="tablist" aria-label="Library collection"><button role="tab" aria-selected={tab === 'bookmarks'} className={tab === 'bookmarks' ? 'active' : ''} onClick={() => setTab('bookmarks')}>Bookmarks <span>{data.bookmarks.length}</span></button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History <span>{data.history.length}</span></button></div>
    {dataLoading ? <Loading text="Opening your library…"/> : tab === 'bookmarks' ? data.bookmarks.length ? <div className="history-list">{data.bookmarks.map(m => <LibraryCard key={m.id} manga={m} progress={data.history.find(p => p.id === m.id)}/>)}</div> : <Empty title="Your next favorite belongs here" text="Tap Bookmark on a story to add it to your collection."/> : data.history.length ? <div className="history-list">{data.history.map(m => <LibraryCard key={m.id} manga={m} progress={m}/>)}</div> : <Empty title="Every story starts somewhere" text="Open a chapter and your reading progress will appear here."/>}<Attribution/>
  </main>;
}
function LibraryCard({ manga, progress }) {
  const percent = progress ? Math.round((progress.page + 1) / progress.totalPages * 100) : 0;
  const to = progress ? `/read/${progress.chapterId}?offset=${progress.offset || 0}` : `/title/${manga.id}`;
  return <article className="history-card library-card"><Link to={`/title/${manga.id}`}><Cover manga={manga}/></Link><div><span className="eyebrow">{manga.tags?.slice(0, 2).map(t => t.name).join(' / ') || 'Manhwa'}</span><Link to={`/title/${manga.id}`}><h3>{manga.title}</h3></Link><div className="library-progress-label"><p>{progress ? `Ch. ${progress.chapterNumber} · Page ${progress.page + 1}` : 'Not started'}</p><span>{percent}%</span></div><div className="progress-track"><span style={{ width: `${percent}%` }}/></div><Link className="button primary library-resume" to={to}><Icon name="play" size={13}/>{progress ? 'Resume' : 'Read Now'}</Link></div></article>;
}
function Profile() {
  const { user, authLoading, data, notify } = useApp();
  const [name, setName] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => setName(user?.user_metadata?.display_name || ''), [user?.id]);
  if (authLoading) return <main className="page"><Loading text="Checking your account…"/></main>;
  return <main className="page profile-page"><div className="page-heading"><span className="eyebrow">Make yourself at home</span><h1>Your Profile</h1></div><section className="profile-card"><ProfilePhoto /><h2>{user ? name || 'Qihon reader' : 'Hello, reader.'}</h2><p>{user ? user.email : 'A good story is even better when you can keep your place.'}</p>{!user && <Link className="button primary" to="/auth">Sign in or create an account</Link>}</section>
    <DiamondWalletCard />

    <section className="stats-grid"><div><strong>{data.bookmarks.length}</strong><span>Saved stories</span></div><div><strong>{data.history.length}</strong><span>Stories started</span></div></section>
    {user && <form className="settings-card" onSubmit={async e => { e.preventDefault(); setBusy(true); const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } }); setBusy(false); notify(error ? error.message : 'Profile updated'); }}><h2>Account details</h2><label>Display name<input maxLength={60} required value={name} onChange={e => setName(e.target.value)} autoComplete="nickname"/></label><button className="button secondary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form>}
    <section className="settings-card"><h2>About Qihon</h2><p>A manhwa reader made for your next chapter. This first version reads freely accessible English chapters from MangaDex.</p><p>{user ? 'Your signed-in library is stored with Supabase.' : 'Guest bookmarks and progress stay in this browser. Signing in opens your account library; guest items are kept separately.'}</p><p>Install Qihon using your browser’s Install app or Add to Home Screen option. Reading chapters requires an internet connection.</p><Link className="text-button" to="/about">Content credits & support</Link></section>
    {user && <button className="button secondary full-width" onClick={async () => { const { error } = await supabase.auth.signOut(); notify(error ? error.message : 'Signed out'); }}><Icon name="logout" size={18}/>Sign out</button>}<Attribution/>
  </main>;
}
function Auth() {
  const { user, recovery, setRecovery, notify } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [displayName, setDisplayName] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const actualMode = recovery ? 'reset' : mode;
  useEffect(() => { if (user && !recovery && mode === 'login') navigate('/profile', { replace: true }); }, [user, recovery, mode, navigate]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      let response;
      if (actualMode === 'signup') response = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName.trim() }, emailRedirectTo: `${window.location.origin}/auth` } });
      else if (actualMode === 'forgot') response = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth` });
      else if (actualMode === 'reset') response = await supabase.auth.updateUser({ password });
      else response = await supabase.auth.signInWithPassword({ email, password });
      if (response.error) throw response.error;
      if (actualMode === 'signup' && !response.data.session) setMessage('Check your email to confirm your account, then sign in.');
      else if (actualMode === 'forgot') setMessage('If this email has an account, a password reset link will arrive shortly.');
      else { setRecovery(false); notify(actualMode === 'reset' ? 'Password updated' : 'Welcome to Qihon'); navigate('/profile'); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function changeMode(next) { setMode(next); setError(''); setMessage(''); }
  return <main className="page auth-page"><Link className="back-link" to="/profile"><Icon name="back" size={20}/>Profile</Link><div className="auth-heading"><span className="brand-mark large"><Icon name="book" size={34}/></span><span className="eyebrow">Your stories. Your space.</span><h1>{actualMode === 'signup' ? 'Start your story.' : actualMode === 'forgot' ? 'Forgot your password?' : actualMode === 'reset' ? 'Set a new password' : 'Welcome back.'}</h1><p>{actualMode === 'signup' ? 'Create an account to keep your library with you.' : actualMode === 'forgot' ? 'We’ll send a link to help you sign in again.' : 'Pick up right where you left off.'}</p></div>
    {!supabase ? <div className="settings-card setup-message"><Icon name="info"/><h2>Account connection needed</h2><p>Reading works now. To enable real sign-up and login, connect this project to your Supabase project using the two values in <code>.env.example</code> and run the included database setup.</p><p>The README has the exact steps. No account is created until Supabase is connected.</p><Link className="button primary" to="/browse">Explore manhwa</Link></div> : <form className="auth-form" onSubmit={submit}>{actualMode === 'signup' && <label>Display name<input autoComplete="nickname" value={displayName} maxLength={60} required onChange={e => setDisplayName(e.target.value)} placeholder="What should we call you?"/></label>}{actualMode !== 'reset' && <label>Email address<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label>}{actualMode !== 'forgot' && <label>Password<input type="password" required minLength={8} autoComplete={actualMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"/></label>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="button primary full-width" disabled={busy}>{busy ? 'Please wait…' : actualMode === 'signup' ? 'Create account' : actualMode === 'forgot' ? 'Send reset link' : actualMode === 'reset' ? 'Update password' : 'Sign in'}</button>{actualMode === 'login' && <button type="button" className="text-button" onClick={() => changeMode('forgot')}>Forgot password?</button>}{!recovery && <p className="auth-switch">{actualMode === 'signup' ? 'Already have an account?' : 'New to Qihon?'} <button type="button" className="text-button" onClick={() => changeMode(actualMode === 'signup' ? 'login' : 'signup')}>{actualMode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>}</form>}
  </main>;
}
function ReaderPage({ src, index, onVisible }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) onVisible(index); }, { rootMargin: '-10% 0px -65% 0px', threshold: 0 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [index, onVisible]);
  return <div className="reader-page" ref={ref} id={`page-${index + 1}`} data-page={index + 1}>{failed ? <div className="page-failure"><Icon name="info"/><p>Page {index + 1} couldn’t load.</p><button className="button secondary" onClick={() => { setAttempt(n => n + 1); setFailed(false); }}>Retry page</button></div> : <img key={attempt} src={src + (attempt ? `&retry=${attempt}` : '')} alt={`Chapter page ${index + 1}`} loading={index < 2 ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)}/>}</div>;
}
function Reader() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const offset = Number(params.get('offset') || 0);
  const { data, saveProgress } = useApp();
  const result = useResource(signal => content('chapter', { id }, signal), [id]);
  const [page, setPage] = useState(0), [showControls, setShowControls] = useState(true);
  const lastPage = useRef(0), changed = useRef(false);
  const valueRef = useRef(null);
  valueRef.current = result.value;
  const onVisible = useCallback(index => { lastPage.current = index; changed.current = true; setPage(index); }, []);
  useEffect(() => { lastPage.current = 0; changed.current = false; setPage(0); window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    const flush = () => {
      const value = valueRef.current;
      if (!changed.current || !value) return;
      changed.current = false;
      saveProgress(value.manga, { chapterId: id, chapterNumber: value.chapter.number, page: lastPage.current, totalPages: value.pages.length, offset });
    };
    const interval = setInterval(flush, 3000);
    document.addEventListener('visibilitychange', flush);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', flush); flush(); };
  }, [id, offset, saveProgress]);
  const chapters = useResource(signal => result.value ? content('chapters', { id: result.value.manga.id, offset }, signal) : Promise.resolve(null), [result.value?.manga.id, offset]);
  if (result.loading) return <main className="reader"><Loading text="Loading your chapter…"/></main>;
  if (result.error) return <main className="page"><Link className="back-link" to="/browse"><Icon name="back" size={20}/>Browse</Link><ErrorState message={result.error} retry={result.retry}/></main>;
  const { manga, chapter, pages } = result.value;
  const saved = data.history.find(p => p.chapterId === id);
  const list = chapters.value?.items || [];
  const index = list.findIndex(c => c.id === id);
  const prev = index > 0 ? list.slice(0, index).reverse().find(c => c.number !== chapter.number) : null;
  const next = index >= 0 ? list.slice(index + 1).find(c => c.number !== chapter.number) : null;
  return <main className={`reader ${showControls ? '' : 'controls-hidden'}`}><header className="reader-header"><Link className="icon-button" to={`/title/${manga.id}?offset=${offset}`} aria-label="Back to chapter list"><Icon name="back"/></Link><div><Link to={`/title/${manga.id}`}>{manga.title}</Link><p>Chapter {chapter.number}{chapter.title ? ` · ${chapter.title}` : ''}</p></div><button
  className="icon-button reader-toggle"
  aria-label={showControls ? 'Hide reader controls' : 'Show reader controls'}
  aria-pressed={!showControls}
  onClick={() => setShowControls(!showControls)}
>
  <Icon name="eye" />
</button>

<NotificationBell />
<HeaderAvatar />
</header>
    <div className="reader-intro"><span className="eyebrow">Chapter {chapter.number}</span><h1>{chapter.title || manga.title}</h1><p>{pages.length} pages · English</p><Attribution groups={chapter.groups}/>{saved?.page > 0 && <button className="button secondary" onClick={() => document.getElementById(`page-${saved.page + 1}`)?.scrollIntoView()}>Resume at page {saved.page + 1}</button>}</div>
    <div className="reader-pages">{pages.map((src, i) => <ReaderPage key={`${id}-${i}`} src={src} index={i} onVisible={onVisible}/>)}</div>
    <section className="chapter-end"><span className="eyebrow">You’ve reached the end</span><h2>One more chapter?</h2><Attribution groups={chapter.groups}/><div className="chapter-navigation">{prev && <Link className="button secondary" to={`/read/${prev.id}?offset=${offset}`}>Previous chapter</Link>}{next ? <Link className="button primary" to={`/read/${next.id}?offset=${offset}`}>Next chapter</Link> : <Link className="button primary" to={`/title/${manga.id}?offset=${index === list.length - 1 && chapters.value?.total > offset + 100 ? offset + 100 : offset}`}>View chapter list</Link>}</div></section>
    <footer className="reader-toolbar"><span>Page {page + 1} / {pages.length}</span><label className="sr-only" htmlFor="page-select">Jump to page</label><select id="page-select" value={page} onChange={e => document.getElementById(`page-${Number(e.target.value) + 1}`)?.scrollIntoView()}>{pages.map((_, i) => <option key={i} value={i}>Page {i + 1}</option>)}</select><Link to={`/title/${manga.id}?offset=${offset}`}><Icon name="book" size={18}/>Chapters</Link></footer>
  </main>;
}
function About() {
  return <main className="page prose"><Link className="back-link" to="/profile"><Icon name="back" size={20}/>Profile</Link><h1>Stories deserve credit.</h1><p>Qihon is an independent, non-commercial student project. MangaDex provides the live catalogue and chapter images. Translation groups are credited on each chapter.</p><h2>Content availability</h2><p>Some titles have incomplete translations, missing chapters, or no readable English pages. These depend on the source. Qihon currently filters the catalogue to Korean originals, English availability, and the source’s safe content rating.</p><h2>Content removal</h2><p>For source content issues, use the report controls on the original MangaDex title or chapter page. Translation groups can request removal from this reader by opening a Content removal issue in the GitHub repository where this project is hosted. The operator must honor these requests.</p><h2>Accounts and privacy</h2><p>Guest reading history and bookmarks are stored on this device. When connected, Supabase handles account authentication and stores each signed-in reader’s library separately. The app never asks for a MangaDex password.</p><h2>Offline use</h2><p>The installed app can open its interface offline after the first production visit. Live chapters and account operations need an internet connection. This version does not download chapters for offline reading.</p><Attribution/></main>;
}
export default function App() {
  const location = useLocation();
  const isReader =
  location.pathname.startsWith('/read/') ||
  location.pathname.startsWith('/offline/');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { if (!isReader) window.scrollTo(0, 0); }, [location.pathname, isReader]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  return <><a href="#main-content" className="skip-link">Skip to content</a>{!isReader && <Header/>}{!online && <div className="offline-banner" role="status">You’re offline. Live chapters and account sync need a connection.</div>}<div id="main-content"><Routes><Route path="/" element={<Home/>}/><Route path="/browse" element={<Browse/>}/><Route
  path="/title/:id"
  element={<ManhwaDetails />}
/><Route
  path="/read/:id"
  element={<ReadingScreen />}
/>

<Route
  path="/offline/:id"
  element={<ReadingScreen />}
/><Route
  path="/library"
  element={
    <ReadingLibrary
      renderCard={(manga, progress) => (
        <LibraryCard
          manga={manga}
          progress={progress}
        />
      )}
    />
  }
/><Route path="/profile" element={<Profile />} />
<Route path="/notifications" element={<NotificationsPage />} />
<Route path="/checkout" element={<CheckoutPage />} /><Route path="/auth" element={<Auth/>}/><Route path="/about" element={<About/>}/><Route path="*" element={<main className="page"><Empty title="This page wandered off" text="There are more stories waiting in Browse."/></main>}/></Routes></div>{!isReader && <Navigation className="bottom-nav"/>}<PwaPrompt/></>;
}
