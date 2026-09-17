import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebSources } from './webSearch.js';

test('parseWebSources maps search_results with url', () => {
  const sources = parseWebSources({
    search_results: [
      { index: 1, title: 'A股行情', url: 'https://example.com/a' },
      { index: 2, title: 'NoUrl', url: '' },
      { title: 'B', url: 'https://example.com/b' },
    ],
  });
  assert.deepEqual(sources, [
    { order: 1, title: 'A股行情', url: 'https://example.com/a' },
    { order: 2, title: 'B', url: 'https://example.com/b' },
  ]);
});

test('parseWebSources returns [] for missing info', () => {
  assert.deepEqual(parseWebSources(null), []);
  assert.deepEqual(parseWebSources({}), []);
});
