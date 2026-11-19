import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { content, plainText } from '../lib/api';
import { useApp } from '../lib/state';

import {
  adjacentChapters,
  chapterTarget,
  formatBytes,
  isDemoLocked,
  loadChapterIndex,
  languageName,
  listDownloads,
  readDownload,
  removeDownload,
  saveDownload,
  saveOfflineProgress,
} from '../lib/reading';

import {
  NotificationBell,
  useQihonExtras,
} from './QihonExtras';

import HeaderAvatar from './HeaderAvatar';
import Icon from './Icon';

import {
  Attribution,
  Cover,
  Empty,
  ErrorState,
  Loading,
} from './UI';

import './ReadingFeatures.css';

const Downloads = createContext(null);
const useDownloads = () => useContext(Downloads);

const errorText = error =>
  error?.name === 'QuotaExceededError'
    ? 'Device storage is full. Remove a download and try again.'
    : error?.message || 'Please try again.';

function useTask(key, loader) {
  const [state, setState] = useState({});
  const [attempt, retry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState({ key, loading: true });

    Promise.resolve()
      .then(() => loader(controller.signal))
      .then(value => {
        if (!controller.signal.aborted) {
          setState({ key, value });
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setState({ key, error: errorText(error) });
        }
      });

    return () => controller.abort();
  }, [key, attempt]);

  return {
    ...(state.key === key ? state : { loading: true }),
    retry: () => retry(n => n + 1),
  };
}

function useBlobUrl(blob) {
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    setSaved({ blob, url });

    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return saved?.blob === blob ? saved.url : null;
}

export function ReadingProvider({ children }) {
  const { user, authLoading, notify } = useApp();
  const { unlocked } = useQihonExtras();

  const owner = authLoading ? 'loading' : user?.id || 'guest';

  const ownerRef = useRef(owner);
  ownerRef.current = owner;

  const active = useRef(null);
  const [saved, setSaved] = useState({});
  const [job, setJob] = useState(null);

  async function refresh() {
    try {
      const records = await listDownloads(owner);

      if (ownerRef.current === owner) {
        setSaved({ owner, records });
      }
    } catch (error) {
      if (ownerRef.current === owner) {
        setSaved({
          owner,
          records: [],
          error: errorText(error),
        });
      }
    }
  }

  useEffect(() => {
    refresh();

    return () => {
      active.current?.controller.abort();
      active.current = null;
    };
  }, [owner]);

  async function start(manga, chapter, chapters) {
    if (active.current || authLoading) return;

    if (isDemoLocked(manga.id, chapter, chapters, unlocked)) {
      notify('Unlock this demo chapter before downloading.');
      return;
    }

    const controller = new AbortController();
    active.current = { owner, controller };

    const update = percent => {
      if (ownerRef.current === owner) {
        setJob({ owner, id: chapter.id, percent });
      }
    };

    update(0);

    try {
      const data = await content(
        'chapter',
        { id: chapter.id },
        controller.signal
      );

      if (!data.pages.length) {
        throw new Error('This chapter has no downloadable pages.');
      }

      const blobs = new Array(data.pages.length);

      let cursor = 0;
      let completed = 0;
      let bytes = 0;

      async function image(url) {
        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (
          !response.ok ||
          !response.headers.get('Content-Type')?.startsWith('image/')
        ) {
          throw new Error(
            'A chapter image failed to download. Please try again.'
          );
        }

        return response.blob();
      }

      async function worker() {
        while (cursor < data.pages.length) {
          const index = cursor++;
          const blob = await image(data.pages[index]);

          bytes += blob.size;

          if (bytes > 150 * 1024 * 1024) {
            throw new Error(
              'This chapter exceeds the 150 MB download limit.'
            );
          }

          blobs[index] = blob;

          update(
            Math.floor(++completed / data.pages.length * 99)
          );
        }
      }

      await Promise.all([worker(), worker()]);

      let coverBlob = null;

      if (manga.cover) {
        try {
          coverBlob = await image(manga.cover);
        } catch (error) {
          if (controller.signal.aborted) throw error;
        }
      }

      controller.signal.throwIfAborted();

      await saveDownload(
        owner,
        data,
        chapters,
        blobs,
        coverBlob
      );

      if (ownerRef.current === owner) {
        await refresh();

        notify(
          `Chapter ${chapter.number} saved for offline reading.`
        );
      }
    } catch (error) {
      controller.abort();

      if (
        ownerRef.current === owner &&
        error.name !== 'AbortError'
      ) {
        notify(errorText(error));
      }
    } finally {
      if (active.current?.controller === controller) {
        active.current = null;
        setJob(null);
      }
    }
  }

  async function remove(id) {
    try {
      await removeDownload(owner, id);
      await refresh();
    } catch (error) {
      if (ownerRef.current === owner) {
        notify(errorText(error));
      }
    }
  }

  const records = saved.owner === owner ? saved.records : [];

  return (
    <Downloads.Provider
      value={{
        owner,
        records,
        error: saved.owner === owner ? saved.error : '',
        job: job?.owner === owner ? job : null,
        start,
        remove,
        refresh,
        cancel: () => active.current?.controller.abort(),
      }}
    >
      {children}
    </Downloads.Provider>
  );
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

export function DownloadButton({ manga, chapter, chapters }) {
  const { records, job, start, cancel } = useDownloads();

  const downloaded = records.some(
    record => record.chapter.id === chapter.id
  );

  if (downloaded) {
    return (
      <Link
        className="chapter-download-icon is-downloaded"
        to="/library?tab=downloads"
        aria-label={`Chapter ${chapter.number} downloaded; open Downloads`}
        title="Downloaded"
      >
        <Icon name="check" size={18} />
      </Link>
    );
  }

  if (job?.id === chapter.id) {
    return (
      <button
        type="button"
        className="chapter-download-icon is-downloading"
        onClick={cancel}
        aria-label={`Cancel download of chapter ${chapter.number}, ${job.percent}% complete`}
        title={`Downloading ${job.percent}% — tap to cancel`}
      >
        <span>{job.percent}%</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="chapter-download-icon"
      disabled={!!job}
      onClick={() => start(manga, chapter, chapters)}
      aria-label={`Download chapter ${chapter.number}`}
      title="Download chapter"
    >
      <Icon name="download" size={18} />
    </button>
  );
}

export function ManhwaDetails() {
  const { id } = useParams();

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

  const result = useTask(id, async signal => {
    const [manga, chapters] = await Promise.all([
      content('manga', { id }, signal),
      loadChapterIndex(id, signal),
    ]);

    return { manga, chapters };
  });

  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
    setExpanded(false);
  }, [id]);

  if (result.loading) {
    return (
      <main className="page">
        <Loading text="Finding all available English chapters…" />
      </main>
    );
  }

  if (result.error) {
    return (
      <main className="page">
        <ErrorState
          message={result.error}
          retry={result.retry}
        />
      </main>
    );
  }

  const { manga, chapters } = result.value;

  const ordered = sort === 'newest'
    ? [...chapters].reverse()
    : chapters;

  const pages = Math.max(1, Math.ceil(ordered.length / 20));
  const currentPage = Math.min(page, pages - 1);

  const visible = ordered.slice(
    currentPage * 20,
    currentPage * 20 + 20
  );

  const progress = data.history.find(item => item.id === id);
  const saved = data.bookmarks.some(item => item.id === id);
  const first = chapters[0];

  const passChapter = chapters.find(chapter =>
    isDemoLocked(id, chapter, chapters, unlocked)
  );

  const passReady =
    Date.now() - (lastPassAt || 0) >= 86400000;

  return (
    <main className="page details-page">
      <Link className="back-link" to="/browse">
        <Icon name="back" />
        Manhwa Details
      </Link>

      <section className="detail-hero">
        <Cover manga={manga} eager />

        <div>
          <span className="eyebrow">Manhwa · English</span>
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
            'No English synopsis is available.'}
        </p>

        <button
          className="text-button"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      </section>

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
              chapterTarget(manga, passChapter),
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
            value={sort}
            onChange={event => {
              setSort(event.target.value);
              setPage(0);
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {chapters.length > 0 && (
          <p className="q-secondary-note">
            English chapters · Source gaps may exist.
            Latest 3: 30 demo diamonds each;
            first available chapter stays free.
          </p>
        )}

        {!chapters.length && (
          <p className="notice">
            No readable English chapters are available.
          </p>
        )}

        <div className="chapter-list">
          {visible.map(chapter => {
            const locked = isDemoLocked(
              id,
              chapter,
              chapters,
              unlocked
            );

            const to = locked
              ? `/checkout?unlock=${chapter.id}`
              : `/read/${chapter.id}`;

            return (
              <div
                className="reading-chapter"
                key={chapter.id}
              >
                <Link className="chapter-row" to={to}>
                  <div>
                    <h3>
                      Chapter {chapter.number}
                      {chapter.title
                        ? ` · ${chapter.title}`
                        : ''}
                    </h3>

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
                      manga={manga}
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

        {pages > 1 && (
          <div className="pagination">
            <button
              className="button secondary"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>

            <span>{currentPage + 1} / {pages}</span>

            <button
              className="button secondary"
              disabled={currentPage + 1 === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      <div className="detail-actions">
        <button
          className="button secondary"
          disabled={dataLoading}
          onClick={() => toggleBookmark(manga)}
        >
          <Icon
            name={saved ? 'check' : 'bookmark'}
            size={17}
          />
          {saved ? 'Saved' : 'Bookmark'}
        </button>

        {first && (
          <Link
            className="button primary"
            to={`/read/${progress?.chapterId || first.id}`}
          >
            <Icon name="play" size={17} />

            {progress
              ? `Resume ${progress.chapterNumber}`
              : `Read Chapter ${first.number}`}
          </Link>
        )}
      </div>

      <Attribution />
    </main>
  );
}

function DownloadCard({ record }) {
  const { data } = useApp();
  const { remove } = useDownloads();

  const [busy, setBusy] = useState(false);
  const cover = useBlobUrl(record.coverBlob);

  const progress = data.history.find(
    item => item.chapterId === record.chapter.id
  );

  const page = Math.max(
    0,
    Math.min(
      record.pageCount - 1,
      Math.max(
        record.lastPage || 0,
        progress?.page || 0
      )
    )
  );

  const started =
    !!progress || (record.lastPage || 0) > 0;

  const percent = started
    ? Math.min(
        100,
        Math.round((page + 1) / record.pageCount * 100)
      )
    : 0;

  const to = `/offline/${record.chapter.id}`;

  return (
    <article className="history-card library-card reading-download">
      <Link to={to}>
        <Cover manga={{ ...record.manga, cover }} />
      </Link>

      <div>
        <span className="eyebrow">
          {record.manga.tags
            ?.slice(0, 2)
            .map(tag => tag.name)
            .join(' / ') || 'Manhwa'}
        </span>

        <Link to={to}>
          <h3>{record.manga.title}</h3>
        </Link>

        <div className="library-progress-label">
          <p>
            {languageName(record.chapter.language || 'en')} · Ch. {record.chapter.number} ·{' '}
            {started
              ? `Page ${page + 1}`
              : `${record.pageCount} pages`}
          </p>

          <span>{percent}%</span>
        </div>

        <div className="progress-track">
          <span style={{ width: `${percent}%` }} />
        </div>

        <div className="reading-download-footer">
          <span className="reading-download-size">
            {formatBytes(record.bytes)} · Offline
          </span>

          <button
            type="button"
            className="text-button"
            disabled={busy}
            aria-label={`Remove download of ${record.manga.title}, chapter ${record.chapter.number}`}
            onClick={async () => {
              setBusy(true);
              await remove(record.chapter.id);
              setBusy(false);
            }}
          >
            Remove
          </button>
        </div>

        <Link
          className="button primary library-resume"
          to={to}
        >
          <Icon name="play" size={13} />
          {started ? 'Resume offline' : 'Read offline'}
        </Link>
      </div>
    </article>
  );
}

export function ReadingLibrary({ renderCard }) {
  const { data, dataLoading } = useApp();

  const {
    records,
    error,
    job,
    cancel,
    refresh,
  } = useDownloads();

  const [params, setParams] = useSearchParams();

  const tab = ['bookmarks', 'history', 'downloads'].includes(
    params.get('tab')
  ) ? params.get('tab') : 'bookmarks';

  useEffect(() => {
    if (tab === 'downloads') refresh();
  }, [tab]);

  const items = tab === 'bookmarks'
    ? data.bookmarks
    : data.history;

  return (
    <main className="page">
      <div className="page-heading">
        <h1>Your Library</h1>

        <p>
          Manage your collection, pick up where you left off,
          and read offline.
        </p>
      </div>

      <div
        className="tabs reading-tabs"
        role="group"
        aria-label="Library collection"
      >
        {['bookmarks', 'history', 'downloads'].map(name => (
          <button
            key={name}
            className={tab === name ? 'active' : ''}
            aria-pressed={tab === name}
            onClick={() => setParams({ tab: name })}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'downloads' ? (
        <>
          {job && (
            <p className="notice" role="status">
              Downloading · {job.percent}%{' '}

              <button
                className="text-button"
                onClick={cancel}
              >
                Cancel
              </button>
            </p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {records.length ? (
            <div className="history-list">
              {records.map(record => (
                <DownloadCard
                  key={record.key}
                  record={record}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="No downloaded chapters yet"
              text="Open a story or chapter and tap Download while online."
            />
          )}

          <p className="q-secondary-note">
            Downloads belong to this account on this device.
            Browser storage can be cleared; check Downloads
            before going offline.
          </p>
        </>
      ) : dataLoading ? (
        <Loading text="Opening your library…" />
      ) : items.length ? (
        <div className="history-list">
          {items.map(manga => (
            <div key={manga.id}>
              {renderCard(
                manga,
                data.history.find(item => item.id === manga.id)
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title={tab === 'bookmarks'
            ? 'Your next favorite belongs here'
            : 'Every story starts somewhere'}
          text={tab === 'bookmarks'
            ? 'Bookmark a story to save it here.'
            : 'Read a chapter to start your history.'}
        />
      )}

      <Attribution />
    </main>
  );
}

function UnlockPanel({ manga, chapter }) {
  const {
    balance,
    lastPassAt,
    unlockDemo,
  } = useQihonExtras();

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(
    0,
    86400000 - (now - (lastPassAt || 0))
  );

  const target = chapterTarget(manga, chapter);

  return (
    <main className="page">
      <Link
        className="back-link"
        to={`/title/${manga.id}?lang=${encodeURIComponent(chapter.language || 'en')}`}
      >
        <Icon name="back" />
        Chapter list
      </Link>

      <section className="q-demo-receipt">
        <Lock />
        <h1>Chapter {chapter.number} is locked</h1>
        <p>{manga.title}</p>
        <p>30 demo diamonds · Your balance: {balance}</p>

        <button
          className="button primary"
          disabled={balance < 30}
          onClick={() => unlockDemo(target)}
        >
          Unlock with 30 demo diamonds
        </button>

        <button
          className="button secondary"
          disabled={remaining > 0}
          onClick={() => unlockDemo(target, true)}
        >
          {remaining
            ? `Free pass in ${Math.ceil(remaining / 3600000)}h`
            : 'Claim Daily Free Pass'}
        </button>

        <Link
          className="button secondary"
          to={`/checkout?unlock=${chapter.id}`}
        >
          Top Up & Unlock
        </Link>

        <p>Demo access is saved on this device.</p>
      </section>
    </main>
  );
}

export function ReadingScreen() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { owner } = useDownloads();
  const { authLoading } = useApp();
  const { unlocked } = useQihonExtras();

  const offline = pathname.startsWith('/offline/');

  const result = useTask(
    `${owner}:${id}:${offline}`,
    async signal => {
      if (authLoading) return null;

      let downloaded;

      try {
        downloaded = await readDownload(owner, id);
      } catch (error) {
        if (offline || !navigator.onLine) throw error;
      }

      if (downloaded) {
        return {
          manga: downloaded.manga,
          chapter: downloaded.chapter,
          chapters: downloaded.chapters,
          blobs: downloaded.blobs,
          lastPage: downloaded.lastPage,
          offline: true,
        };
      }

      if (offline) {
        throw new Error(
          'This chapter is not downloaded for the current account. ' +
          'Connect to the internet and download it first.'
        );
      }

      const data = await content(
        'chapter',
        { id },
        signal
      );

        const chapters = await loadChapterIndex(
        data.manga.id,
        signal,
        data.chapter.language || 'en'
      );

      return {
        ...data,
        chapters,
        offline: false,
      };
    }
  );

  if (
    authLoading ||
    result.loading ||
    (!result.value && !result.error)
  ) {
    return (
      <main className="page">
        <Loading text="Opening your chapter…" />
      </main>
    );
  }

  if (result.error) {
    return (
      <main className="page">
        <Link
          className="back-link"
          to="/library?tab=downloads"
        >
          <Icon name="back" />
          Downloads
        </Link>

        <ErrorState
          message={result.error}
          retry={result.retry}
        />
      </main>
    );
  }

  const { manga, chapter, chapters } = result.value;

  if (isDemoLocked(manga.id, chapter, chapters, unlocked)) {
    return (
      <UnlockPanel
        manga={manga}
        chapter={chapter}
      />
    );
  }

  return (
    <ReadingView
      key={`${owner}:${id}:${offline}`}
      value={result.value}
      forceOffline={offline}
    />
  );
}

function PageImage({ src, index, onVisible }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          onVisible(index);
        }
      },
      {
        rootMargin: '-10% 0px -65% 0px',
        threshold: 0,
      }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [index, onVisible]);

  const image = src.startsWith('blob:') || !attempt
    ? src
    : `${src}&retry=${attempt}`;

  return (
    <div
      className="reader-page"
      ref={ref}
      id={`page-${index + 1}`}
    >
      {failed ? (
        <div className="page-failure">
          <p>Page {index + 1} could not load.</p>

          <button
            className="button secondary"
            onClick={() => {
              setAttempt(n => n + 1);
              setFailed(false);
            }}
          >
            Retry page
          </button>
        </div>
      ) : (
        <img
          key={attempt}
          src={image}
          alt={`Chapter page ${index + 1}`}
          loading={index < 2 ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function ReadingView({ value, forceOffline }) {
  const {
    manga,
    chapter,
    chapters,
    offline,
    lastPage: offlinePage,
  } = value;

  const { data, user, saveProgress } = useApp();
  const { owner, records } = useDownloads();
  const { unlocked } = useQihonExtras();

  const [urls, setUrls] = useState([]);
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState(true);

  const lastPage = useRef(0);
  const changed = useRef(false);

  const onVisible = useCallback(index => {
    lastPage.current = index;
    changed.current = true;
    setPage(index);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);

    if (!value.blobs) {
      setUrls(value.pages);
      return;
    }

    const list = value.blobs.map(blob =>
      URL.createObjectURL(blob)
    );

    setUrls(list);

    return () =>
      list.forEach(url => URL.revokeObjectURL(url));
  }, [value]);

  useEffect(() => {
    const flush = () => {
      if (!changed.current) return;

      changed.current = false;

      if (offline) {
        saveOfflineProgress(
          owner,
          chapter.id,
          lastPage.current
        ).catch(() => {});
      }

      if (!user || (!forceOffline && navigator.onLine)) {
        saveProgress(manga, {
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          page: lastPage.current,
          totalPages: urls.length,
          offset: 0,
        });
      }
    };

    const timer = setInterval(flush, 3000);

    document.addEventListener('visibilitychange', flush);

    return () => {
      clearInterval(timer);
      document.removeEventListener(
        'visibilitychange',
        flush
      );
      flush();
    };
  }, [
    owner,
    chapter.id,
    urls.length,
    offline,
    forceOffline,
    user?.id,
    saveProgress,
  ]);

  const savedPage = Math.max(
    0,
    Math.min(
      urls.length - 1,
      Math.max(
        offlinePage || 0,
        data.history.find(
          item => item.chapterId === chapter.id
        )?.page || 0
      )
    )
  );

  const { previous, next } = adjacentChapters(
    manga.id,
    chapter,
    chapters
  );

  async function jumpToPage(index) {
    const images = [
      ...document.querySelectorAll('.reader-page img'),
    ].slice(0, index + 1);

    await Promise.all(
      images.map(image => {
        image.loading = 'eager';
        return image.decode().catch(() => {});
      })
    );

    document
      .getElementById(`page-${index + 1}`)
      ?.scrollIntoView();

    onVisible(index);
  }

  function navigation(item, label) {
    if (!item) {
      return (
        <button className="button secondary" disabled>
          {label}
        </button>
      );
    }

    const downloaded = records.some(
      record => record.chapter.id === item.id
    );

    const locked = isDemoLocked(
      manga.id,
      item,
      chapters,
      unlocked
    );

    if (forceOffline && !downloaded) {
      return (
        <button className="button secondary" disabled>
          {label} · Not downloaded
        </button>
      );
    }

    const to = forceOffline
      ? `/offline/${item.id}`
      : locked
        ? `/checkout?unlock=${item.id}`
        : `/read/${item.id}`;

    return (
      <Link className="button secondary" to={to}>
        {locked && <Lock />}
        {label} · {item.number}
      </Link>
    );
  }

  return (
    <main
      className={`reader ${
        controls ? '' : 'controls-hidden'
      }`}
    >
      <header className="reader-header">
        <Link
          className="icon-button"
          to={forceOffline
            ? '/library?tab=downloads'
            : `/title/${manga.id}`}
          aria-label="Back to chapter list"
        >
          <Icon name="back" />
        </Link>

        <div>
          <Link to={`/title/${manga.id}`}>
            {manga.title}
          </Link>
          <p>Chapter {chapter.number}</p>
        </div>

        <button
          className="icon-button reader-toggle"
          aria-label={controls
            ? 'Hide reader controls'
            : 'Show reader controls'}
          onClick={() => setControls(!controls)}
        >
          <Icon name="eye" />
        </button>

        <NotificationBell />
        <HeaderAvatar />
      </header>

      <div className="reader-intro">
        <span className="eyebrow">
          Chapter {chapter.number}
        </span>

        <h1>{chapter.title || manga.title}</h1>

        <p>
          {urls.length} pages · {languageName(chapter.language || 'en')}
          {offline ? ' · Saved on this device' : ''}
        </p>

        <Attribution groups={chapter.groups} />

        {savedPage > 0 && (
          <button
            className="button secondary"
            onClick={() => jumpToPage(savedPage)}
          >
            Resume at page {savedPage + 1}
          </button>
        )}
      </div>

      <div className="reader-pages">
        {urls.map((src, index) => (
          <PageImage
            key={src}
            src={src}
            index={index}
            onVisible={onVisible}
          />
        ))}
      </div>

      <section className="chapter-end">
        <h2>Chapter complete</h2>

        <div className="chapter-navigation">
          {navigation(previous, 'Previous chapter')}
          {navigation(next, 'Next chapter')}
        </div>

        <Link
          className="text-button"
          to={forceOffline
            ? '/library?tab=downloads'
            : `/title/${manga.id}`}
        >
          {forceOffline ? 'Downloads' : 'View chapter list'}
        </Link>

        <Attribution groups={chapter.groups} />
      </section>

      <footer className="reader-toolbar">
        <span>
          Page {page + 1} / {urls.length}
        </span>

        <label className="sr-only" htmlFor="reading-page">
          Jump to page
        </label>

        <select
          id="reading-page"
          value={page}
          onChange={event =>
            jumpToPage(Number(event.target.value))
          }
        >
          {urls.map((_, index) => (
            <option key={index} value={index}>
              Page {index + 1}
            </option>
          ))}
        </select>

        <Link to="/library?tab=downloads">
          <Icon name="download" size={18} />
          Downloads
        </Link>
      </footer>
    </main>
  );
}