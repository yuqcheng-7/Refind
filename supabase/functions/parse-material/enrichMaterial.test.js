import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichMaterialSummaryAndTags } from './enrichMaterial.js';

test('uses AI JSON when chat succeeds', async () => {
  const result = await enrichMaterialSummaryAndTags({
    deepseekChat: async () => JSON.stringify({
      summary: 'AI 生成的摘要内容足够长。',
      tags: ['增长', '研究', '产品'],
    }),
    title: 't',
    platform: 'web',
    contentText: '很长的正文内容……',
    tagsUserEdited: false,
  });
  assert.equal(result.usedAi, true);
  assert.equal(result.summary, 'AI 生成的摘要内容足够长。');
  assert.deepEqual(result.tags, ['增长', '研究', '产品']);
});

test('returns nulls when chat throws', async () => {
  const result = await enrichMaterialSummaryAndTags({
    deepseekChat: async () => { throw new Error('timeout'); },
    title: 't',
    platform: 'web',
    contentText: '正文',
    tagsUserEdited: false,
  });
  assert.equal(result.usedAi, false);
  assert.equal(result.summary, null);
  assert.equal(result.tags, null);
});

test('fails soft when chat exceeds enrichment timeout', async () => {
  const result = await enrichMaterialSummaryAndTags({
    deepseekChat: () => new Promise(() => {}),
    title: 't',
    platform: 'web',
    contentText: '正文',
    timeoutMs: 20,
  });
  assert.equal(result.usedAi, false);
  assert.equal(result.summary, null);
  assert.equal(result.tags, null);
});
