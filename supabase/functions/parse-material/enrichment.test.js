import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMaterialEnrichmentPrompt,
  normalizeTagList,
  parseMaterialEnrichmentResponse,
  shouldReplaceTags,
} from './enrichment.js';

test('normalizeTagList caps at 3, strips #, dedupes empties', () => {
  assert.deepEqual(
    normalizeTagList(['#增长', '增长', ' 用户研究 ', '', '#产品', '多余']),
    ['增长', '用户研究', '产品'],
  );
});

test('parseMaterialEnrichmentResponse accepts fenced JSON', () => {
  const raw = '```json\n{"summary":"这是一段四十到一百二十字以内的摘要。","tags":["A","B","C"]}\n```';
  assert.deepEqual(parseMaterialEnrichmentResponse(raw), {
    summary: '这是一段四十到一百二十字以内的摘要。',
    tags: ['A', 'B', 'C'],
  });
});

test('parseMaterialEnrichmentResponse returns null on garbage', () => {
  assert.equal(parseMaterialEnrichmentResponse('not json'), null);
  assert.equal(parseMaterialEnrichmentResponse('{"summary":""}'), null);
});

test('shouldReplaceTags respects user edit lock', () => {
  assert.equal(shouldReplaceTags({ tagsUserEdited: false }), true);
  assert.equal(shouldReplaceTags({ tagsUserEdited: true }), false);
});

test('buildMaterialEnrichmentPrompt includes title and truncated body', () => {
  const messages = buildMaterialEnrichmentPrompt({
    title: '标题',
    platform: 'web',
    contentText: '正文'.repeat(5000),
  });
  assert.ok(Array.isArray(messages) && messages.length >= 1);
  const blob = messages.map((m) => m.content).join('\n');
  assert.match(blob, /标题/);
  assert.match(blob, /summary/);
  assert.match(blob, /tags/);
  assert.ok(blob.length < 20000);
});
