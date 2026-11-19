import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContent, validateImageBase } from '../server/content.mjs';
const mangaId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const request = params => new URL(`http://localhost/api/content?${new URLSearchParams(params)}`);
const manga = { id: mangaId, attributes: { title: { en: 'Fixture story' }, description: { en: 'Fixture' }, contentRating: 'safe', tags: [] }, relationships: [] };
const chapter = { id: chapterId, attributes: { chapter: '1', title: 'First', translatedLanguage: 'en', pages: 2, externalUrl: null }, relationships: [{ type: 'manga', id: mangaId }, { type: 'scanlation_group', id: mangaId, attributes: { name: 'Fixture translators' } }] };

test('Image hosts reject SSRF targets and credentialed URLs', () => {
  for (const url of ['http://uploads.mangadex.org', 'https://127.0.0.1', 'https://mangadex.network.evil.test', 'https://uploads.mangadex.org@evil.test', 'https://u:p@uploads.mangadex.org', 'https://x.mangadex.network:4000']) assert.throws(() => validateImageBase(url));
  assert.equal(validateImageBase('https://uploads.mangadex.org').hostname, 'uploads.mangadex.org');
  assert.equal(validateImageBase('https://server.mangadex.network/token').pathname, '/token');
});
test('Invalid requests do not contact upstream', async () => {
  const never = () => { throw new Error('Should not fetch'); };
  for (const params of [{ action: 'chapter', id: '../private' }, { action: 'catalog', offset: '-1' }, { action: 'image', kind: 'remote', url: 'https://example.com' }, { action: 'unknown' }]) {
    assert.equal((await handleContent(request(params), 'GET', never)).status, 400);
  }
  assert.equal((await handleContent(request({ action: 'catalog' }), 'POST', never)).status, 405);
});
test('An English chapter resolves ordered page URLs and credits; images are served through the bounded backend', async () => {
  const calls = [];
  const mock = async urlValue => {
    const url = new URL(urlValue); calls.push(url.href);
    if (url.pathname === `/manga/${mangaId}`) return Response.json({ result: 'ok', data: manga });
    if (url.pathname === `/chapter/${chapterId}`) return Response.json({ result: 'ok', data: chapter });
    if (url.pathname === `/at-home/server/${chapterId}`) return Response.json({ result: 'ok', baseUrl: 'https://uploads.mangadex.org', chapter: { hash: 'abc123', dataSaver: ['first.jpg', 'second.jpg'] } });
    if (url.pathname === '/data-saver/abc123/second.jpg') return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } });
    throw new Error(`Unexpected upstream ${url}`);
  };
  const response = await handleContent(request({ action: 'chapter', id: chapterId }), 'GET', mock);
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.pages.length, 2);
  assert.equal(body.chapter.groups[0].name, 'Fixture translators');
  assert.ok(body.pages[1].endsWith('&page=1')); assert.ok(!body.pages[1].includes('uploads.mangadex.org'));
  const image = await handleContent(request({ action: 'image', kind: 'page', id: chapterId, page: '1' }), 'GET', mock);
  assert.equal(image.status, 200); assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  assert.equal((await image.arrayBuffer()).byteLength, 4);
  assert.equal((await handleContent(request({ action: 'image', kind: 'page', id: chapterId, page: '5' }), 'GET', mock)).status, 400);
  assert.equal(calls.filter(c => c.includes(`/at-home/server/${chapterId}`)).length, 1, 'A fresh image manifest is reused');
});

test('Catalogue requests enforce Korean originals, English availability, and the safe rating', async () => {
  let seen;
  const mock = async value => { seen = new URL(value); return Response.json({ result: 'ok', data: [manga], total: 1 }); };
  const result = await handleContent(request({ action: 'catalog', q: 'Fixture search' }), 'GET', mock);
  assert.equal(result.status, 200);
  assert.equal(seen.searchParams.get('originalLanguage[]'), 'ko');
  assert.equal(
  seen.searchParams.has('availableTranslatedLanguage[]'),
  false
);
  assert.equal(seen.searchParams.get('contentRating[]'), 'safe');
});
test('External-only chapters and chapters without image pages are rejected', async () => {
  const cases = [
    [4, { externalUrl: 'https://publisher.example/chapter' }],
    [5, { pages: 0 }],
  ];

  for (const [n, attributes] of cases) {
    const cId =
      `${n}${n}${n}${n}${n}${n}${n}${n}` +
      '-1111-4111-8111-111111111111';

    let calls = 0;

    const mock = async () => {
      calls++;

      return Response.json({
        result: 'ok',
        data: {
          ...chapter,
          id: cId,
          attributes: {
            ...chapter.attributes,
            ...attributes,
          },
        },
      });
    };

    const result = await handleContent(
      request({
        action: 'chapter',
        id: cId,
      }),
      'GET',
      mock
    );

    assert.equal(result.status, 404);
    assert.equal(calls, 1);
  }
});
