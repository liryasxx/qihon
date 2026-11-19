import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
export function Loading({ text = 'Finding your next chapter…' }) {
  return <div className="state-panel" role="status"><span className="spinner"/><p>{text}</p></div>;
}
export function ErrorState({ message, retry }) {
  return <div className="state-panel error-state" role="alert"><Icon name="info" size={28}/><h2>Something interrupted the story</h2><p>{message}</p>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>;
}
export function Empty({ title, text, action = 'Explore manhwa' }) {
  return <div className="state-panel"><div className="empty-icon"><Icon name="book" size={34}/></div><h2>{title}</h2><p>{text}</p><Link className="button primary" to="/browse">{action}</Link></div>;
}
export function Cover({ manga, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  return <div className={`cover ${className}`}>{manga.cover && !failed ? <img src={manga.cover} alt={`${manga.title} cover`} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)}/> : <div className="cover-placeholder"><Icon name="book" size={35}/><span>{manga.title}</span></div>}</div>;
}
export function MangaCard({ manga, rank }) {
  return <Link className="manga-card" to={`/title/${manga.id}`}><div className="card-art"><Cover manga={manga}/>{rank && <span className="rank">#{rank}</span>}<span
  className="language-tag"
  aria-label="Chapter language options"
>
  <Icon name="globe" size={14} />
</span></div><h3>{manga.title}</h3><p>{manga.tags?.slice(0, 2).map(t => t.name).join(' · ') || 'Manhwa'}</p></Link>;
}
export function Attribution({ groups = [] }) {
  return <div className="attribution">Content provided by <a href="https://mangadex.org" target="_blank" rel="noreferrer">MangaDex</a>.{groups.length > 0 && <span> Translation: {groups.map((g, i) => <span key={g.id}>{i > 0 && ', '}<a href={`https://mangadex.org/group/${g.id}`} target="_blank" rel="noreferrer">{g.name}</a></span>)}</span>}<span> Qihon is an independent, non-commercial student project.</span></div>;
}
