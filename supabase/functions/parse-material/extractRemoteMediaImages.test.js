import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMediaUrlsAppendix, uniqueUrls } from './extractRemoteMediaImages.js';

test('uniqueUrls dedupes and trims', () => {
  assert.deepEqual(
    uniqueUrls([' https://a/x.jpg ', 'https://a/x.jpg', '']),
    ['https://a/x.jpg'],
  );
});

test('buildMediaUrlsAppendix returns empty when no urls', async () => {
  const out = await buildMediaUrlsAppendix({ mediaUrls: [], extractImageContent: async () => ({}) });
  assert.equal(out, '');
});

test('buildMediaUrlsAppendix OCRs fetched images', async () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name === 'content-type' ? 'image/png' : null) },
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: pngHeader };
          },
          cancel: async () => {},
        };
      },
    },
  });

  const out = await buildMediaUrlsAppendix({
    mediaUrls: ['https://sns-img.example.com/note/1.jpg'],
    extractImageContent: async () => ({ content_text: '识别到的文字' }),
    dashscopeKey: 'test-key',
    fetchImpl,
  });

  assert.match(out, /【文内图片识别】/);
  assert.match(out, /识别到的文字/);
  assert.match(out, /【笔记图片 1】/);
});
