import { useEffect, useState } from 'react';
import {
  Link,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { content, plainText } from '../lib/api';
import { useApp } from '../lib/state';

import {
  chapterTarget,
  isDemoLocked,
  languageName,
  loadChapterIndex,
} from '../lib/reading';

import { useQihonExtras } from './QihonExtras';
import { DownloadButton } from './ReadingFeatures';

import {
  Attribution,
  Cover,
  ErrorState,
  Loading,
} from './UI';

import Icon from './Icon';
import './ReadingFeatures.css';

function useChapters(id, preferred) {
  const key = `${id}:${preferred}`;
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState({ key, loading: true });

    (async () => {
      const manga = await content(
        'manga',
        { id },
        controller.signal
      );

      const languages = [
        ...new Set(['en', ...(manga.languages || [])]),
      ];

      const language = languages.includes(preferred)
        ? preferred
        : manga.languages?.includes('en')
          ? 'en'
          : manga.languages?.[0] || 'en';

      const chapters = await loadChapterIndex(
        id,
        controller.signal,
        language
      );

      if (!controller.signal.aborted) {
        setState({
          key,
          value: {
            manga,
            chapters,
            languages,
            language,
          },
        });
      }
    })().catch(error => {
      if (!controller.signal.aborted) {
        setState({ key, error: error.message });
      }
    });

    return () => controller.abort();
  }, [key, attempt]);

  return {
    ...(state.key === key ? state : { loading: true }),
    retry: () => setAttempt(value => value + 1),
  };
}

function Lock() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </svg>
  );
}

const chapterLabel = chapter =>
  `${chapter.volume ? `Vol. ${chapter.volume} · ` : ''}` +
  `Chapter ${chapter.number}` +
  `${chapter.title ? ` · ${chapter.title}` : ''}`;

export default function ManhwaDetails() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  const {
    data,
    dataLoading,
    toggleBookmark,
  } = useApp();

  const {
    unlocked,
    lastPassAt,
    unlockDemo,
  } = useQihonExtras();

  const preferred =
    params.get('lang') ||
    data.history.find(item => item.id === id)?.readingLanguage ||
    data.bookmarks.find(item => item.id === id)?.readingLanguage ||
    '';

  const result = useChapters(id, preferred);

  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState({});

  useEffect(() => setExpanded(false), [id]);

  if (result.loading) {
    return (
      <main className="page">
        <Loading text="Finding available chapters…" />
      </main>
    );
  }

  if (result.error) {
    return (
      <main className="page">
        <Link className="back-link" to="/browse">
          <Icon name="back" />
          Browse
        </Link>

        <ErrorState
          message={result.error}
          retry={result.retry}
        />
      </main>
    );
  }

  const {
    manga,
    chapters,
    languages,
    language,
  } = result.value;

  const viewKey = `${id}:${language}`;

  const current = view.key === viewKey
    ? view
    : {
        key: viewKey,
        page: 0,
        sort: 'newest',
        chapterId: '',
      };

  const updateView = values =>
    setView({ ...current, ...values });

  const ordered = current.sort === 'oldest'
    ? chapters
    : [...chapters].reverse();

  const totalPages = Math.max(
    1,
    Math.ceil(ordered.length / 20)
  );

  const page = Math.min(current.page, totalPages - 1);

  const visible = ordered.slice(
    page * 20,
    page * 20 + 20
  );

  const progress = data.history.find(
    item =>
      item.id === id &&
      chapters.some(chapter => chapter.id === item.chapterId)
  );

  const first = chapters[0];
  const latest = chapters.at(-1);

  const selected =
    chapters.find(chapter => chapter.id === current.chapterId) ||
    chapters.find(chapter => chapter.id === progress?.chapterId) ||
    first;

  const bookmarked = data.bookmarks.some(
    item => item.id === id
  );

  const passChapter = chapters.find(chapter =>
    isDemoLocked(id, chapter, chapters, unlocked)
  );

  const passReady =
    Date.now() - (lastPassAt || 0) >= 86400000;

  const savedManga = {
    ...manga,
    readingLanguage: language,
  };

  const chapterUrl = chapter =>
    isDemoLocked(id, chapter, chapters, unlocked)
      ? `/checkout?unlock=${chapter.id}`
      : `/read/${chapter.id}`;

  function changeLanguage(value) {
    const next = new URLSearchParams(params);
    next.set('lang', value);
    setParams(next);
  }

  return (
    <main className="page details-page">
      <Link className="back-link" to="/browse">
        <Icon name="back" />
        Manhwa Details
      </Link>

      <section className="detail-hero">
        <Cover manga={manga} eager />

        <div>
          <span className="eyebrow">
            MangaDex · {languageName(language)}
          </span>

          <h1>{manga.title}</h1>

          <p className="muted">
            {manga.authors.join(' & ')}
          </p>

          <div className="tag-list">
            {manga.tags.slice(0, 5).map(tag => (
              <span className="pill" key={tag.id}>
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="synopsis">
        <h2>Synopsis</h2>

        <p className={expanded ? '' : 'clamped'}>
          {plainText(manga.description) ||
            'No synopsis is available.'}
        </p>

        <button
          className="text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      </section>

      <section className="chapter-language-panel">
        <label htmlFor="chapter-language">
          Chapter language
        </label>

        <select
          id="chapter-language"
          value={language}
          onChange={event => changeLanguage(event.target.value)}
        >
          {[...languages]
            .sort((a, b) =>
              languageName(a).localeCompare(languageName(b))
            )
            .map(code => (
              <option key={code} value={code}>
                {languageName(code)}
              </option>
            ))}
        </select>

        <p>
          Chapter images stay in the language you choose.
          Availability depends on MangaDex uploads.
        </p>
      </section>

      {chapters.length > 0 && (
        <>
          <section className="reading-pass">
            <Icon name="clock" />

            <div>
              <strong>Daily Free Pass</strong>

              <p>
                {passReady
                  ? 'One free chapter unlock every 24 hours.'
                  : `Next pass: ${new Date(
                      lastPassAt + 86400000
                    ).toLocaleString()}`}
              </p>
            </div>

            <button
              className="button secondary"
              disabled={!passReady || !passChapter}
              onClick={() =>
                unlockDemo(
                  chapterTarget(savedManga, passChapter),
                  true
                )
              }
            >
              {!passChapter
                ? 'All open'
                : passReady
                  ? 'Claim'
                  : 'Claimed'}
            </button>
          </section>

          <section className="chapter-jump-panel">
            <label htmlFor="chapter-jump">
              Open an available chapter
            </label>

            <div className="chapter-jump-row">
              <select
                id="chapter-jump"
                value={selected.id}
                onChange={event =>
                  updateView({
                    chapterId: event.target.value,
                  })
                }
              >
                {chapters.map(chapter => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapterLabel(chapter)}
                  </option>
                ))}
              </select>

              <Link
                className="button secondary"
                to={chapterUrl(selected)}
              >
                Open
              </Link>
            </div>

            <div className="chapter-quick-links">
              <Link to={chapterUrl(first)}>
                First available · {first.number}
              </Link>

              <Link to={chapterUrl(latest)}>
                Latest available · {latest.number}
              </Link>
            </div>
          </section>
        </>
      )}

      <section className="chapters-section">
        <div className="reading-chapter-heading">
          <h2>
            Chapters <small>{chapters.length} available</small>
          </h2>

          <label className="sr-only" htmlFor="chapter-order">
            Chapter order
          </label>

          <select
            id="chapter-order"
            value={current.sort}
            onChange={event =>
              updateView({
                sort: event.target.value,
                page: 0,
              })
            }
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {chapters.length > 0 ? (
          <>
            <p className="q-secondary-note">
              {languageName(language)} · Missing chapter numbers
              are not available in this language. Latest 3:
              30 demo diamonds each; first available chapter
              stays free.
            </p>

            <div className="chapter-list">
              {visible.map(chapter => {
                const locked = isDemoLocked(
                  id,
                  chapter,
                  chapters,
                  unlocked
                );

                const to = chapterUrl(chapter);

                return (
                  <div
                    className="reading-chapter"
                    key={chapter.id}
                  >
                    <Link className="chapter-row" to={to}>
                      <div>
                        <h3>{chapterLabel(chapter)}</h3>

                        <p>
                          {chapter.pages} pages ·{' '}
                          {locked
                            ? '30 demo diamonds'
                            : 'Available to read'}
                        </p>
                      </div>
                    </Link>

                    <div className="chapter-row-actions">
                      {!locked && (
                        <DownloadButton
                          manga={savedManga}
                          chapter={chapter}
                          chapters={chapters}
                        />
                      )}

                      <Link
                        className="chapter-open"
                        to={to}
                        aria-label={`${
                          locked ? 'Unlock' : 'Read'
                        } chapter ${chapter.number}`}
                      >
                        {locked
                          ? <Lock />
                          : <Icon name="chevron" size={18} />}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="chapter-page-summary">
              Showing {page * 20 + 1}–
              {page * 20 + visible.length} of {chapters.length}
              {' '}· {languageName(language)}
            </p>

            <div className="chapter-page-controls">
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => updateView({ page: page - 1 })}
              >
                Previous
              </button>

              <label>
                <span className="sr-only">
                  Chapter list page
                </span>

                <select
                  aria-label="Chapter list page"
                  value={page}
                  onChange={event =>
                    updateView({
                      page: Number(event.target.value),
                    })
                  }
                >
                  {Array.from(
                    { length: totalPages },
                    (_, index) => (
                      <option key={index} value={index}>
                        Page {index + 1} of {totalPages}
                      </option>
                    )
                  )}
                </select>
              </label>

              <button
                className="button secondary"
                disabled={page + 1 === totalPages}
                onClick={() => updateView({ page: page + 1 })}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="notice">
            <p>
              No readable chapter images were returned in{' '}
              {languageName(language)}.
              Choose another language above.
            </p>

            <a
              className="text-button"
              href={manga.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Check this title on MangaDex
            </a>
          </div>
        )}
      </section>

      <div className="detail-actions">
        <button
          className="button secondary"
          disabled={dataLoading}
          onClick={() => toggleBookmark(savedManga)}
        >
          <Icon
            name={bookmarked ? 'check' : 'bookmark'}
            size={17}
          />
          {bookmarked ? 'Saved' : 'Bookmark'}
        </button>

        {first && (
          <Link
            className="button primary"
            to={chapterUrl(
              chapters.find(
                chapter => chapter.id === progress?.chapterId
              ) || first
            )}
          >
            <Icon name="play" size={17} />

            {progress
              ? `Resume ${progress.chapterNumber}`
              : `Read Chapter ${first.number}`}
          </Link>
        )}
      </div>

      <Attribution manga={manga} />
    </main>
  );
}