import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOutlineFromAi,
  normalizeOutlineRequestBody,
  parseOutlineAiJson,
} from './core.js';

test('normalizeOutlineRequestBody requires noteId', () => {
  assert.throws(() => normalizeOutlineRequestBody({}), /noteId/);
});

test('parseOutlineAiJson requires chapters array', () => {
  const parsed = parseOutlineAiJson('{"chapters":[{"title":"开场","cardIds":["a"]}]}');
  assert.equal(parsed.chapters[0].title, '开场');
});

test('buildOutlineFromAi assigns stable chapter ids and parks leftover cards', () => {
  const outline = buildOutlineFromAi(
    { chapters: [{ title: '动机', cardIds: ['a'] }, { title: '方法', cardIds: ['b'] }] },
    ['a', 'b', 'c'],
  );
  assert.equal(outline.version, 1);
  assert.equal(outline.chapters.length, 2);
  assert.deepEqual(outline.chapters[0].cardIds, ['a']);
  assert.deepEqual(outline.unassignedCardIds, ['c']);
  assert.ok(outline.chapters[0].id);
});
