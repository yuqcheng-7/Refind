import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearListCoverCache,
  getListCover,
  listCoverCacheKey,
  loadListCoverOnce,
  setListCover,
} from './listCoverCache.js';

describe('listCoverCache', () => {
  beforeEach(() => {
    clearListCoverCache();
  });

  it('returns a stable key for the same material cover source', () => {
    const material = { id: 'm1', inputType: 'pdf' };
    const source = { kind: 'pdf', value: 'u/a.pdf' };
    expect(listCoverCacheKey(material, source)).toBe('m1|pdf|u/a.pdf||pdf');
  });

  it('reuses cached covers and dedupes in-flight loaders', async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'data:image/png;base64,abc';
    };

    const [a, b] = await Promise.all([
      loadListCoverOnce('k1', loader),
      loadListCoverOnce('k1', loader),
    ]);

    expect(a).toBe('data:image/png;base64,abc');
    expect(b).toBe('data:image/png;base64,abc');
    expect(calls).toBe(1);
    expect(getListCover('k1')).toBe('data:image/png;base64,abc');

    const again = await loadListCoverOnce('k1', loader);
    expect(again).toBe('data:image/png;base64,abc');
    expect(calls).toBe(1);
  });

  it('stores covers via setListCover', () => {
    setListCover('k2', 'https://example.com/c.jpg');
    expect(getListCover('k2')).toBe('https://example.com/c.jpg');
  });
});
