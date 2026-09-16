import { describe, expect, it } from 'vitest';
import {
  clearPlatformCoverCache,
  getPlatformCoverUrl,
  isMainstreamPlatform,
  renderPlatformCoverDataUrl,
} from './platformCover.js';

describe('platformCover', () => {
  it('recognizes mainstream platforms', () => {
    expect(isMainstreamPlatform('xhs')).toBe(true);
    expect(isMainstreamPlatform('douyin')).toBe(true);
    expect(isMainstreamPlatform('web')).toBe(false);
  });

  it('returns abstract svg data urls for each mainstream platform', () => {
    clearPlatformCoverCache();
    for (const platform of ['xhs', 'douyin', 'wechat_mp', 'zhihu', 'bilibili']) {
      const url = renderPlatformCoverDataUrl(platform);
      expect(url.startsWith('data:image/svg+xml')).toBe(true);
      expect(getPlatformCoverUrl(platform)).toBe(url);
      const decoded = decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
      expect(decoded).toContain('<svg');
      expect(decoded).toContain('#2a3340');
    }
    expect(renderPlatformCoverDataUrl('other')).toBe('');
  });

  it('draws distinct marks per platform', () => {
    clearPlatformCoverCache();
    const marks = ['xhs', 'douyin', 'wechat_mp', 'zhihu', 'bilibili'].map((code) => (
      decodeURIComponent(renderPlatformCoverDataUrl(code).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''))
    ));
    expect(new Set(marks).size).toBe(5);
  });
});
