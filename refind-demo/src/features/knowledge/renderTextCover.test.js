import { describe, expect, it } from 'vitest';
import { clearTextCoverCache, renderTextCoverDataUrl } from './renderTextCover.js';

describe('renderTextCoverDataUrl', () => {
  it('renders a white mini preview from plain text', () => {
    clearTextCoverCache();
    const url = renderTextCoverDataUrl('增长策略拆解：先做供给，再做留存。', {
      cacheKey: 't1',
      label: 'MD',
    });
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('增长策略');
    expect(decoded).toContain('fill="#ffffff"');
    expect(decoded).not.toContain('#f4f1ea');
  });
});
