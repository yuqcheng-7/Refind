import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInlineImageMarkdown,
  buildInlineImageOcrAppendix,
  buildOcrBlocksFromPersisted,
  enrichContentWithInlineImages,
  storageMarkdownForKey,
  stripInlineImageEnrichment,
} from './inlineImageContent.js';

test('storage markdown and image list', () => {
  assert.equal(storageMarkdownForKey('u/m.inline.1.jpg'), '![](storage:u/m.inline.1.jpg)');
  assert.equal(
    buildInlineImageMarkdown([
      { objectKey: 'u/m.inline.1.jpg' },
      { objectKey: 'u/m.inline.2.png' },
    ]),
    '![](storage:u/m.inline.1.jpg)\n\n![](storage:u/m.inline.2.png)',
  );
});

test('OCR appendix uses 图N labels', () => {
  const appendix = buildInlineImageOcrAppendix([
    { index: 1, text: '图一文字' },
    { index: 2, text: '图二文字' },
  ]);
  assert.match(appendix, /【文内图片识别】/);
  assert.match(appendix, /【图1】\n图一文字/);
  assert.match(appendix, /【图2】\n图二文字/);
});

test('enrichContentWithInlineImages appends markdown then OCR', () => {
  const full = enrichContentWithInlineImages({
    baseText: '正文第一段。',
    persisted: [{ objectKey: 'u/m.inline.1.jpg' }],
    ocrBlocks: [{ index: 1, text: '识别字' }],
  });
  assert.match(full, /^正文第一段。/);
  assert.match(full, /!\[\]\(storage:u\/m\.inline\.1\.jpg\)/);
  assert.match(full, /【文内图片识别】[\s\S]*【图1】\n识别字/);
});

test('stripInlineImageEnrichment removes prior markdown and appendix', () => {
  const raw = '正文。\n\n![](storage:u/m.inline.1.jpg)\n\n【文内图片识别】\n\n【图1】\nx';
  assert.equal(stripInlineImageEnrichment(raw), '正文。');
});

test('buildOcrBlocksFromPersisted OCRs bytes', async () => {
  const blocks = await buildOcrBlocksFromPersisted({
    persisted: [
      {
        index: 1,
        objectKey: 'u/m.inline.1.jpg',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
      },
    ],
    extractImageContent: async () => ({ content_text: 'OCR 结果' }),
  });
  assert.deepEqual(blocks, [{ index: 1, text: 'OCR 结果' }]);
});
