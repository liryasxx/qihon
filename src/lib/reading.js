import { content } from './api.js';

const indexes = new Map();

const languageNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'language' })
    : null;

export function languageName(code = 'en') {
  const overrides = {
    'es-la': 'Spanish (Latin America)',
    'zh-hk': 'Chinese (Traditional)',
    'ja-ro': 'Japanese (Romanized)',
    'ko-ro': 'Korean (Romanized)',
    'zh-ro': 'Chinese (Romanized)',
  };

  try {
    return overrides[code] || languageNames?.of(code) || code;
  } catch {
    return code;
  }
}
const numeric = value => /^\d+(\.\d+)?$/.test(String(value ?? ''));
const collator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

export function chapterKey(mangaId, chapter) {
  const number = numeric(chapter.number)
    ? String(Number(chapter.number))
    : `special:${chapter.id}`;

  const key =
    `${mangaId}:${chapter.volume ?? ''}:${number}`;

  return chapter.language && chapter.language !== 'en'
    ? `${key}:${chapter.language}`
    : key;
}

export function orderedChapters(mangaId, chapters) {
  const seen = new Set();

  return [...chapters].sort((a, b) => {
    const number = numeric(a.number) && numeric(b.number)
      ? Number(a.number) - Number(b.number)
      : collator.compare(String(a.number), String(b.number));

    return number || collator.compare(
      String(a.volume ?? ''),
      String(b.volume ?? '')
    );
  }).filter(chapter => {
    const key = chapterKey(mangaId, chapter);

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export async function loadChapterIndex(
  mangaId,
  signal,
  language = 'en'
) {
  const cacheKey = `${mangaId}:${language}`;
  const hit = indexes.get(cacheKey);

  if (hit && hit.expires > Date.now()) {
    return hit.items;
  }

  const items = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < 10000) {
    if (signal?.aborted) {
      throw new DOMException('Cancelled', 'AbortError');
    }

    const result = await content(
      'chapters',
      {
        id: mangaId,
        offset,
        lang: language,
      },
      signal
    );

    if (
      !Array.isArray(result.items) ||
      !Number.isInteger(result.total) ||
      result.total < 0
    ) {
      throw new Error(
        'The chapter list returned an unexpected response. Please retry.'
      );
    }

    items.push(...result.items);
    total = result.total;
    offset += result.limit || 100;
  }

  if (total > 10000) {
    throw new Error(
      'This title exceeds the 10,000-upload reading limit. Choose another title.'
    );
  }

  const sorted = orderedChapters(mangaId, items);

  if (indexes.size > 30) {
    indexes.delete(indexes.keys().next().value);
  }

  if (sorted.length) {
    indexes.set(cacheKey, {
      expires: Date.now() + 5 * 60 * 1000,
      items: sorted,
    });
  }

  return sorted;
}

export function isDemoLocked(mangaId, chapter, chapters, unlocked) {
  const key = chapterKey(mangaId, chapter);

  const index = chapters.findIndex(
    item => chapterKey(mangaId, item) === key
  );

  return index >= Math.max(1, chapters.length - 3)
    && !unlocked.includes(key);
}

export function chapterTarget(manga, chapter) {
  return {
    key: chapterKey(manga.id, chapter),
    id: chapter.id,
    number: chapter.number,
    mangaId: manga.id,
    mangaTitle: manga.title,
  };
}

export function adjacentChapters(mangaId, current, chapters) {
  const key = chapterKey(mangaId, current);

  const index = chapters.findIndex(
    chapter => chapterKey(mangaId, chapter) === key
  );

  return {
    previous: index > 0 ? chapters[index - 1] : null,
    next: index >= 0 ? chapters[index + 1] || null : null,
  };
}

export const formatBytes = bytes =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const recordKey = (owner, id) => `${owner}:${id}`;
let connection;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(
      new Error('Offline storage is unavailable in this browser.')
    );
  }

  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('qihon-offline', 1);

      request.onupgradeneeded = () => {
        const database = request.result;

        database
          .createObjectStore('chapters', { keyPath: 'key' })
          .createIndex('owner', 'owner');

        database
          .createObjectStore('pages', { keyPath: 'key' })
          .createIndex('chapter', 'chapter');
      };

      request.onsuccess = () => {
        const database = request.result;

        database.onversionchange = () => {
          database.close();
          connection = null;
        };

        resolve(database);
      };

      request.onerror = () => {
        connection = null;
        reject(request.error);
      };

      request.onblocked = () => {
        connection = null;
        reject(new Error('Close other Qihon tabs and try again.'));
      };
    });
  }

  return connection;
}

async function readRequest(store, operation) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly');
    const request = operation(transaction.objectStore(store));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function listDownloads(owner) {
  const records = await readRequest(
    'chapters',
    store => store.index('owner').getAll(owner)
  );

  return records.sort((a, b) => b.savedAt - a.savedAt);
}

export async function readDownload(owner, id) {
  const key = recordKey(owner, id);

  const record = await readRequest(
    'chapters',
    store => store.get(key)
  );

  if (!record || record.owner !== owner) return null;

  const pages = await readRequest(
    'pages',
    store => store.index('chapter').getAll(key)
  );

  pages.sort((a, b) => a.index - b.index);

  if (pages.length !== record.pageCount) {
    throw new Error(
      'This download is incomplete. Remove it and download it again.'
    );
  }

  return {
    ...record,
    blobs: pages.map(page => page.blob),
  };
}

function clearPages(store, key, done) {
  const request = store.index('chapter').openCursor(
    IDBKeyRange.only(key)
  );

  request.onsuccess = () => {
    const cursor = request.result;

    if (cursor) {
      cursor.delete();
      cursor.continue();
    } else {
      done();
    }
  };
}

export async function saveDownload(
  owner,
  data,
  chapters,
  blobs,
  coverBlob
) {
  const database = await openDatabase();
  const key = recordKey(owner, data.chapter.id);

  const bytes = blobs.reduce(
    (sum, blob) => sum + blob.size,
    coverBlob?.size || 0
  );

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ['chapters', 'pages'],
      'readwrite'
    );

    transaction.oncomplete = resolve;

    transaction.onabort = () => reject(
      transaction.error || new Error('The download could not be saved.')
    );

    transaction.onerror = () => {};

    const pages = transaction.objectStore('pages');

    clearPages(pages, key, () => {
      blobs.forEach((blob, index) => {
        pages.put({
          key: `${key}:${index}`,
          chapter: key,
          index,
          blob,
        });
      });

      transaction.objectStore('chapters').put({
        key,
        owner,
        manga: data.manga,
        chapter: data.chapter,
        chapters,
        pageCount: blobs.length,
        bytes,
        coverBlob,
        savedAt: Date.now(),
        lastPage: 0,
      });
    });
  });
}

export async function removeDownload(owner, id) {
  const database = await openDatabase();
  const key = recordKey(owner, id);

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      ['chapters', 'pages'],
      'readwrite'
    );

    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};

    transaction.objectStore('chapters').delete(key);
    clearPages(transaction.objectStore('pages'), key, () => {});
  });
}

export async function saveOfflineProgress(owner, id, page) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      'chapters',
      'readwrite'
    );

    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};

    const store = transaction.objectStore('chapters');
    const request = store.get(recordKey(owner, id));

    request.onsuccess = () => {
      if (request.result) {
        store.put({
          ...request.result,
          lastPage: page,
        });
      }
    };
  });
}