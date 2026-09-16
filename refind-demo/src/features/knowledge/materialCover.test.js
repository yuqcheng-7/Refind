import { describe, expect, it } from 'vitest';
import { buildCoverObjectKey, plainTextForCover, resolveMaterialCoverSource } from './materialCover.js';

describe('resolveMaterialCoverSource', () => {
  it('prefers private storage cover over external URL', () => {
    expect(resolveMaterialCoverSource({
      coverImageUrl: 'https://cdn.example.com/a.jpg',
      coverStorageObjectKey: 'u/a.cover.jpg',
      inputType: 'image',
      storageObjectKey: 'u/a.png',
    })).toEqual({ kind: 'storage', value: 'u/a.cover.jpg' });
  });

  it('uses external cover URL when no storage cover exists', () => {
    expect(resolveMaterialCoverSource({
      coverImageUrl: 'https://cdn.example.com/a.jpg',
      inputType: 'link',
      platform: 'web',
      kind: 'link',
    })).toEqual({ kind: 'url', value: 'https://cdn.example.com/a.jpg' });
  });

  it('prefers real covers for mainstream links; platform mark is fallback only', () => {
    expect(resolveMaterialCoverSource({
      kind: 'link',
      inputType: 'link',
      platform: 'xhs',
      coverImageUrl: 'https://cdn.example.com/note.jpg',
      coverStorageObjectKey: 'u/xhs.cover.jpg',
      url: 'https://www.xiaohongshu.com/explore/1',
    })).toEqual({ kind: 'storage', value: 'u/xhs.cover.jpg' });

    expect(resolveMaterialCoverSource({
      kind: 'link',
      platform: 'bilibili',
      coverImageUrl: 'https://cdn.example.com/bili.jpg',
      url: 'https://www.bilibili.com/video/BV1',
    })).toEqual({ kind: 'url', value: 'https://cdn.example.com/bili.jpg' });

    expect(resolveMaterialCoverSource({
      kind: 'link',
      inputType: 'link',
      platform: 'xhs',
      url: 'https://www.xiaohongshu.com/explore/abc',
    })).toEqual({ kind: 'platform', value: 'xhs' });

    expect(resolveMaterialCoverSource({
      kind: 'link',
      inputType: 'link',
      url: 'https://www.xiaohongshu.com/explore/abc',
    })).toEqual({ kind: 'platform', value: 'xhs' });
  });

  it('uses stored cover object for uploaded files', () => {
    expect(resolveMaterialCoverSource({
      coverStorageObjectKey: 'u/doc.docx.cover.jpg',
      inputType: 'docx',
      storageObjectKey: 'u/doc.docx',
    })).toEqual({ kind: 'storage', value: 'u/doc.docx.cover.jpg' });
  });

  it('falls back to original image storage', () => {
    expect(resolveMaterialCoverSource({
      inputType: 'image',
      storageObjectKey: 'u/photo.png',
    })).toEqual({ kind: 'storage', value: 'u/photo.png' });
  });

  it('uses pdf bytes for pdf covers', () => {
    expect(resolveMaterialCoverSource({
      inputType: 'pdf',
      storageObjectKey: 'u/a.pdf',
    })).toEqual({ kind: 'pdf', value: 'u/a.pdf' });
  });

  it('uses preview pdf for converted office files', () => {
    expect(resolveMaterialCoverSource({
      inputType: 'pptx',
      storageObjectKey: 'u/deck.pptx',
      previewStorageObjectKey: 'u/deck.pptx.preview.pdf',
    })).toEqual({ kind: 'pdf', value: 'u/deck.pptx.preview.pdf' });
  });

  it('falls back to office package for embedded cover extraction', () => {
    expect(resolveMaterialCoverSource({
      inputType: 'docx',
      storageObjectKey: 'u/note.docx',
    })).toEqual({ kind: 'office-embed', value: 'u/note.docx' });
  });

  it('uses text cover for markdown and plain text', () => {
    expect(resolveMaterialCoverSource({
      inputType: 'markdown',
      body: '# 标题\n正文内容',
      storageObjectKey: 'u/a.md',
    })).toEqual({
      kind: 'text',
      value: '# 标题\n正文内容',
      storageKey: 'u/a.md',
      inputType: 'markdown',
    });

    expect(resolveMaterialCoverSource({
      inputType: 'txt',
      storageObjectKey: 'u/a.txt',
    })).toEqual({
      kind: 'text',
      value: '',
      storageKey: 'u/a.txt',
      inputType: 'txt',
    });
  });
});

describe('plainTextForCover', () => {
  it('strips common markdown markers', () => {
    expect(plainTextForCover('# 标题\n**加粗** 与 _斜体_')).toContain('标题');
    expect(plainTextForCover('# 标题\n**加粗** 与 _斜体_')).not.toContain('**');
  });
});

describe('buildCoverObjectKey', () => {
  it('appends cover suffix', () => {
    expect(buildCoverObjectKey('user/kb/file.docx', 'png')).toBe('user/kb/file.docx.cover.png');
  });
});
