const API = 'https://api.mangadex.org';
const USER_AGENT = 'Qihon/0.1 (non-commercial student reader; MangaDex API client)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cache = new Map();
let queue = Promise.resolve();
let lastApiCall = 0;
let cooldownUntil = 0;

export class ContentError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
function id(value) {
  if (!UUID.test(value || '')) throw new ContentError('Invalid title or chapter identifier.', 400);
  return value;
}
function number(value, fallback, min, max) {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value)) throw new ContentError('Invalid page number.', 400);
  const n = Number(value);
  if (n < min || n > max) throw new ContentError('Page is outside the supported range.', 400);
  return n;
}
async function api(path, params = {}, ttl = 60000, fetcher = fetch) {
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  const key = url.href;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  const task = queue.then(async () => {
    const secondHit = cache.get(key);
    if (secondHit && secondHit.expires > Date.now()) return secondHit.data;
    if (Date.now() < cooldownUntil) throw new ContentError('The chapter source is busy. Please try again in a moment.', 429);
    // Keep each process below MangaDex's general API request limit.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 300 - (Date.now() - lastApiCall))));
    lastApiCall = Date.now();
    const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (response.status === 429) {
      const retry = Number(response.headers.get('X-RateLimit-Retry-After'));
      cooldownUntil = Number.isFinite(retry) && retry > Date.now() / 1000 ? retry * 1000 : Date.now() + 15000;
      throw new ContentError('The chapter source is busy. Please try again in a moment.', 429);
    }
    if (response.status === 404) throw new ContentError('This title or chapter is no longer available.', 404);
    if (!response.ok) throw new ContentError('The chapter source is temporarily unavailable. Please try again.');
    const data = await response.json();
    if (data.result !== 'ok') throw new ContentError('The chapter source returned an unexpected response.');
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  });
  queue = task.catch(() => {});
  return task;
}
function localized(value) { return value?.en || Object.values(value || {}).find(Boolean) || ''; }
export function normalizeManga(manga) {
  const a = manga.attributes;
  const cover = manga.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
  return {
    id: manga.id, title: localized(a.title) || 'Untitled', description: localized(a.description),
    cover: cover ? `/api/content?action=image&kind=cover&id=${manga.id}&file=${encodeURIComponent(cover)}` : null,
    tags: (a.tags || []).filter(t => t.attributes.group === 'genre').map(t => ({ id: t.id, name: localized(t.attributes.name) })),
    status: a.status, year: a.year,
    authors: manga.relationships?.filter(r => r.type === 'author').map(r => r.attributes?.name).filter(Boolean) || [],
    lastChapter: a.lastChapter || null,
languages: [
  ...new Set(
    (a.availableTranslatedLanguages || []).filter(
      code =>
        typeof code === 'string' &&
        /^[a-z]{2}(?:-[a-z]{2})?$/.test(code)
    )
  ),
],
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
}
export function normalizeChapter(chapter) {
  const a = chapter.attributes;
  return { id: chapter.id, number: a.chapter || 'Special', title: a.title || '', language: a.translatedLanguage,
    pages: a.pages, volume: a.volume, date: a.publishAt,
    groups: chapter.relationships?.filter(r => r.type === 'scanlation_group').map(r => ({ id: r.id, name: r.attributes?.name || 'Translation group' })) || [],
  };
}
export function validateImageBase(value) {
  let url;
  try { url = new URL(value); } catch { throw new ContentError('Invalid chapter image host.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !(url.hostname === 'uploads.mangadex.org' || url.hostname.endsWith('.mangadex.network'))) {
    throw new ContentError('Unrecognized chapter image host.');
  }
  return url;
}
async function safeManga(mangaId, fetcher) {
  const result = await api(`/manga/${id(mangaId)}`, { 'includes[]': ['cover_art', 'author'] }, 300000, fetcher);
  if (result.data.attributes.contentRating !== 'safe') throw new ContentError('This reader currently supports titles rated safe only.', 403);
  return result.data;
}
async function safeChapter(chapterId, fetcher) {
  const result = await api(`/chapter/${id(chapterId)}`, { 'includes[]': ['scanlation_group'] }, 300000, fetcher);
  const chapter = result.data;
  const mangaId = chapter.relationships?.find(r => r.type === 'manga')?.id;
    if (!(chapter.attributes.pages > 0) || chapter.attributes.externalUrl) {
    throw new ContentError(
      'Image pages are not available for this chapter. Choose another chapter.',
      404
    );
  }
  const manga = await safeManga(mangaId, fetcher);
  return { chapter, manga };
}
async function manifest(chapterId, fetcher) {
  const result = await api(`/at-home/server/${id(chapterId)}`, { forcePort443: true }, 600000, fetcher);
  validateImageBase(result.baseUrl);
  if (!/^[0-9a-f]+$/i.test(result.chapter?.hash || '') || !Array.isArray(result.chapter?.dataSaver) || !result.chapter.dataSaver.length) throw new ContentError('No readable image pages are available for this chapter.', 404);
  return result;
}
function filename(value) {
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i.test(value || '')) throw new ContentError('Invalid image filename.', 400);
  return value;
}
async function imageResponse(url, fetcher) {
  const start = Date.now();
  const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000), redirect: 'error' });
  const type = response.headers.get('Content-Type') || '';
  if (!response.ok || !/^image\/(jpeg|png|webp|gif)(;|$)/i.test(type)) throw new ContentError('This page could not load. Tap Retry page.');
  const size = Number(response.headers.get('Content-Length'));
  if (size > 25000000) throw new ContentError('This image is too large to load.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 25000000) throw new ContentError('This image is too large to load.');
  if (url.hostname.endsWith('.mangadex.network')) {
    try { await fetcher('https://api.mangadex.network/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ url: url.href, success: true, cached: response.headers.get('X-Cache')?.startsWith('HIT') || false, bytes: bytes.byteLength, duration: Date.now() - start }),
      signal: AbortSignal.timeout(1500), redirect: 'error',
    }); } catch { /* Delivery telemetry must not prevent reading. */ }
  }
  return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handleContent(url, method = 'GET', fetcher = fetch) {
  if (method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  const q = url.searchParams;
  try {
    switch (q.get('action') || 'catalog') {
      case 'catalog': {
        const offset = number(q.get('offset'), 0, 0, 9900);
        const title = (q.get('q') || '').trim().slice(0, 100);
        const params = { limit: 20, offset, 'originalLanguage[]': ['ko'],
          'contentRating[]': ['safe'], 'includes[]': ['cover_art', 'author'],
          [q.get('sort') === 'latest' ? 'order[latestUploadedChapter]' : 'order[followedCount]']: 'desc', hasAvailableChapters: true };
        if (title) params.title = title;
        if (q.get('tag')) params['includedTags[]'] = [id(q.get('tag'))];
        const data = await api('/manga', params, 60000, fetcher);
        return json({ items: data.data.map(normalizeManga), total: data.total, offset, limit: 20 });
      }
            case 'manga':
        return json(
          normalizeManga(await safeManga(q.get('id'), fetcher))
        );

      case 'languages': {
        const mangaId = id(q.get('id'));
        const manga = await safeManga(mangaId, fetcher);

        const params = {
          limit: 500,
          offset: 0,
          'contentRating[]': ['safe'],
          includeExternalUrl: 0,
          includeEmptyPages: 0,
          includeFuturePublishAt: 0,
        };

        const readable = chapter =>
          chapter.attributes.pages > 0 &&
          !chapter.attributes.externalUrl &&
          /^[a-z]{2}(?:-[a-z]{2})?$/.test(
            chapter.attributes.translatedLanguage || ''
          );

        const feed = await api(
          `/manga/${mangaId}/feed`,
          params,
          300000,
          fetcher
        );

        const available = new Set(
          feed.data
            .filter(readable)
            .map(chapter => chapter.attributes.translatedLanguage)
        );

        // Check languages absent from the first batch on larger titles.
        if (feed.total > feed.data.length) {
          for (const language of normalizeManga(manga).languages) {
            if (available.has(language)) continue;

            const probe = await api(
              `/manga/${mangaId}/feed`,
              {
                ...params,
                limit: 1,
                'translatedLanguage[]': [language],
              },
              300000,
              fetcher
            );

            if (probe.data.some(readable)) {
              available.add(language);
            }
          }
        }

        return json({
          items: [...available].sort(),
        });
      }
                 case 'chapters': {
        const mangaId = id(q.get('id'));
        const language = (q.get('lang') || 'en').toLowerCase();

        if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) {
          throw new ContentError(
            'Select a valid chapter language.',
            400
          );
        }

        await safeManga(mangaId, fetcher);

        const offset = number(
          q.get('offset'),
          0,
          0,
          9900
        );

        const data = await api(
          `/manga/${mangaId}/feed`,
          {
            limit: 100,
            offset,
            'translatedLanguage[]': [language],
            'contentRating[]': ['safe'],
            'includes[]': ['scanlation_group'],

            ...(q.get('sort') === 'latest'
              ? { 'order[publishAt]': 'desc' }
              : {
                  'order[chapter]': 'asc',
                  'order[volume]': 'asc',
                }),

            includeExternalUrl: 0,
            includeEmptyPages: 0,
            includeFuturePublishAt: 0,
          },
          60000,
          fetcher
        );

        return json({
          items: data.data
            .filter(
              chapter =>
                chapter.attributes.translatedLanguage === language &&
                chapter.attributes.pages > 0 &&
                !chapter.attributes.externalUrl
            )
            .map(normalizeChapter),
          total: data.total,
          offset,
          limit: 100,
        });
      }
      case 'chapter': {
        const chapterId = id(q.get('id'));
        const { chapter, manga } = await safeChapter(chapterId, fetcher);
        const data = await manifest(chapterId, fetcher);
        return json({ chapter: normalizeChapter(chapter), manga: {
  ...normalizeManga(manga),
  readingLanguage: chapter.attributes.translatedLanguage,
},
          pages: data.chapter.dataSaver.map((_, page) => `/api/content?action=image&kind=page&id=${chapterId}&page=${page}`) });
      }
      case 'image': {
        if (q.get('kind') === 'cover') {
          const manga = await safeManga(q.get('id'), fetcher);
          const allowed = manga.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
          if (q.get('file') !== allowed) throw new ContentError('Cover not found.', 404);
          return await imageResponse(new URL(`https://uploads.mangadex.org/covers/${manga.id}/${filename(allowed)}.256.jpg`), fetcher);
        }
        if (q.get('kind') !== 'page') throw new ContentError('Invalid image request.', 400);
        const chapterId = id(q.get('id'));
        await safeChapter(chapterId, fetcher);
        const data = await manifest(chapterId, fetcher);
        const page = number(q.get('page'), 0, 0, data.chapter.dataSaver.length - 1);
        const file = filename(data.chapter.dataSaver[page]);
        const base = validateImageBase(data.baseUrl);
        base.pathname = `${base.pathname.replace(/\/$/, '')}/data-saver/${data.chapter.hash}/${file}`;
        return await imageResponse(base, fetcher);
      }
      default: throw new ContentError('Unknown content request.', 400);
    }
  } catch (error) {
    const status = error instanceof ContentError ? error.status : 502;
    return json({ error: error instanceof ContentError ? error.message : 'Could not reach the chapter source. Check your connection and try again.' }, status,
      status === 429 ? { 'Retry-After': '15' } : {});
  }
}
