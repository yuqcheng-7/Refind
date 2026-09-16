/**
 * Session-scoped cache for knowledge-list cover display URLs.
 * Survives MaterialListCover remounts when switching nav tabs.
 */
const coverCache = new Map();
const inflight = new Map();

export function listCoverCacheKey(material = {}, source = {}) {
  return [
    material?.id || '',
    source.kind || '',
    source.value || '',
    source.storageKey || '',
    source.inputType || material?.inputType || '',
  ].join('|');
}

export function getListCover(cacheKey) {
  const key = String(cacheKey || '').trim();
  if (!key) return '';
  return coverCache.get(key) || '';
}

export function setListCover(cacheKey, url) {
  const key = String(cacheKey || '').trim();
  const value = String(url || '').trim();
  if (!key || !value) return;
  coverCache.set(key, value);
}

export async function loadListCoverOnce(cacheKey, loader) {
  const key = String(cacheKey || '').trim();
  if (!key) return loader();
  const cached = coverCache.get(key);
  if (cached) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const pending = Promise.resolve()
    .then(() => loader())
    .then((url) => {
      const value = String(url || '').trim();
      if (value) coverCache.set(key, value);
      inflight.delete(key);
      return value;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, pending);
  return pending;
}

export function clearListCoverCache() {
  coverCache.clear();
  inflight.clear();
}
