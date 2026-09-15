import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkText, focusExcerpt, splitPassageUnits } from './chunkText.js';

test('splitPassageUnits breaks on Chinese sentence punctuation', () => {
  assert.deepEqual(
    splitPassageUnits('我们是谁。做什么。为什么。'),
    ['我们是谁。', '做什么。', '为什么。'],
  );
});

test('chunkText keeps short docs as one passage-sized chunk', () => {
  const chunks = chunkText('第一句。第二句。');
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].content, /第一句/);
  assert.match(chunks[0].content, /第二句/);
});

test('chunkText splits long docs into multiple short passages', () => {
  const sentences = Array.from({ length: 40 }, (_, i) => `这是第${i + 1}句，用来说明训练营的某一段具体内容。`);
  const text = sentences.join('');
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 4, `expected several chunks, got ${chunks.length}`);
  assert.ok(chunks.every((chunk) => chunk.content.length <= 420));
  assert.ok(chunks[0].content.length < text.length);
  // Later chunks should not all start at the document title/opening only.
  const openings = new Set(chunks.map((chunk) => chunk.content.slice(0, 12)));
  assert.ok(openings.size >= 2);
});

test('focusExcerpt picks the sentence that overlaps the answer near [n]', () => {
  const chunk = '我们是谁。训练营每周直播答疑。报名方式见官网。';
  const excerpt = focusExcerpt(chunk, {
    answer: '课程支持每周直播答疑[2]。',
    order: 2,
    max: 80,
  });
  assert.match(excerpt, /每周直播答疑/);
  assert.ok(!excerpt.startsWith('我们是谁'));
});

test('focusExcerpt falls back to leading sentences when no hint', () => {
  const excerpt = focusExcerpt('开头介绍。后面细节很长很长。', { max: 40 });
  assert.match(excerpt, /开头介绍/);
});
