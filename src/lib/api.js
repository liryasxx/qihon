const cache = new Map();
export async function content(action, params = {}, signal) {
  const query = new URLSearchParams({ action, ...params });
  const key = query.toString();
  const previous = cache.get(key);
  if (previous && previous.until > Date.now()) return previous.data;
  const response = await fetch(`/api/content?${key}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load this page. Please try again.');
  cache.set(key, { data, until: Date.now() + 60000 });
  return data;
}
export const sourceName = 'MangaDex';
export function plainText(value = '') {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]*>/g, '').replace(/\*{1,2}|_{1,2}/g, '').trim();
}
