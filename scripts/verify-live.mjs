import { handleContent } from '../server/content.mjs';
async function request(params) {
  const response = await handleContent(new URL(`http://localhost/api/content?${new URLSearchParams(params)}`));
  if (!response.ok) throw new Error(await response.text());
  return response;
}
const catalogue = await (await request({ action: 'catalog' })).json();
if (!catalogue.items.length) throw new Error('No live titles returned');
// Test a previously verified English chapter unless a caller supplies another one.
const chapterId = process.argv[2] || '5a9d1282-9b6b-4853-b18e-396d54f0fc52';
const chapter = await (await request({ action: 'chapter', id: chapterId })).json();
console.log(`LIVE: ${chapter.manga.title} — chapter ${chapter.chapter.number}, ${chapter.pages.length} English pages`);
let bytes = 0;
for (let page = 0; page < chapter.pages.length; page++) {
  const response = await request({ action: 'image', kind: 'page', id: chapterId, page: String(page) });
  if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error(`Page ${page + 1} is not an image`);
  const length = (await response.arrayBuffer()).byteLength;
  if (!length) throw new Error(`Page ${page + 1} was empty`);
  bytes += length; console.log(`Page ${page + 1}/${chapter.pages.length}: OK (${length} bytes)`);
}
console.log(`PASS: complete chapter fetched through Qihon's API (${bytes} bytes).`);
