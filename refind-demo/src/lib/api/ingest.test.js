import { describe, expect, it, vi } from 'vitest';
import {
  buildMaterialStorageKey,
  buildPlatformParsePayload,
  inferMaterialInputType,
  shouldUseSavedSession,
} from './ingest.js';

describe('inferMaterialInputType', () => {
  it('derives the supported material type from file names and MIME types', () => {
    expect(inferMaterialInputType(new File(['# note'], 'notes.MD', { type: 'text/markdown' }))).toBe('markdown');
    expect(inferMaterialInputType(new File(['plain'], 'readme.txt', { type: 'text/plain' }))).toBe('txt');
    expect(inferMaterialInputType(new File(['pdf'], 'report', { type: 'application/pdf' }))).toBe('pdf');
    expect(inferMaterialInputType(new File(['csv'], 'data.csv', { type: 'text/csv' }))).toBe('csv');
    expect(inferMaterialInputType(new File(['img'], 'photo.JPG', { type: 'image/jpeg' }))).toBe('image');
  });
});

describe('buildMaterialStorageKey', () => {
  it('uses uuid and safe extension without original filename characters', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111');
    expect(buildMaterialStorageKey('user-1', '联想天禧本地智助+V1-演讲稿.docx'))
      .toBe('user-1/11111111-1111-1111-1111-111111111111.docx');
    expect(buildMaterialStorageKey('user-1', 'weird name.pdf'))
      .toBe('user-1/11111111-1111-1111-1111-111111111111.pdf');
  });
});

describe('buildPlatformParsePayload', () => {
  it('includes use_saved_session when the platform is connected', () => {
    expect(buildPlatformParsePayload('https://www.zhihu.com/question/1', { useSavedSession: true }))
      .toEqual({ url: 'https://www.zhihu.com/question/1', use_saved_session: true });
    expect(buildPlatformParsePayload('https://www.zhihu.com/question/1'))
      .toEqual({ url: 'https://www.zhihu.com/question/1', use_saved_session: false });
  });
});

describe('shouldUseSavedSession', () => {
  it('is true only when the URL platform is marked connected', async () => {
    const listConnections = vi.fn(async () => ([
      { code: 'zhihu', connection: { status: 'connected' } },
      { code: 'xhs', connection: { status: 'disconnected' } },
    ]));

    await expect(shouldUseSavedSession('https://www.zhihu.com/question/1', { listConnections }))
      .resolves.toBe(true);
    await expect(shouldUseSavedSession('https://www.xiaohongshu.com/explore/1', { listConnections }))
      .resolves.toBe(false);
    await expect(shouldUseSavedSession('https://example.com/a', { listConnections }))
      .resolves.toBe(false);
  });
});
