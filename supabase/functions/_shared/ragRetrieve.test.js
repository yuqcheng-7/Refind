import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAG_INSUFFICIENT_CONTENT,
  RAG_SYSTEM_RULES,
  applyExternalRerank,
  buildRagSystemPrompt,
  buildRetrievalQuery,
  countByMaterialTitle,
  diversifyByMaterial,
  extractQueryTerms,
  fuseByRrf,
  isRetrievalTooWeak,
  lightRerank,
  logRagDebug,
  needsRetrievalContext,
  rerankCandidatesWithFallback,
} from './ragRetrieve.js';

test('insufficient copy is the fixed Chinese sentence', () => {
  assert.equal(RAG_INSUFFICIENT_CONTENT, '暂无相关资料');
});

test('extractQueryTerms drops stopwords and keeps chinese/latin tokens', () => {
  assert.deepEqual(
    extractQueryTerms('什么是 RAG 检索 和 重排呢'),
    ['rag', '检索', '重排'],
  );
  const terms = extractQueryTerms('请问大模型是什么？');
  assert.ok(terms.includes('大模型') || terms.includes('模型'));
  assert.ok(!terms.includes('请问'));
});

test('standalone follow-up questions retrieve with current query only', () => {
  assert.equal(
    buildRetrievalQuery('transformer是什么', ['大模型是什么']),
    'transformer是什么',
  );
  assert.equal(buildRetrievalQuery('单独问题', []), '单独问题');
  assert.equal(needsRetrievalContext('transformer是什么'), false);
});

test('deixis follow-ups only borrow key terms from last user turn', () => {
  assert.equal(needsRetrievalContext('它是什么'), true);
  const q = buildRetrievalQuery('它是什么', ['大模型 fine-tuning 入门']);
  assert.match(q, /它是什么$/);
  assert.doesNotMatch(q, /大模型 fine-tuning 入门/);
  assert.match(q, /大模型|fine|tuning|入门/);
});

test('diversifyByMaterial keeps at most N chunks per material_id', () => {
  const rows = [
    { chunk_id: 'a1', material_id: 'm1', material_title: '入门' },
    { chunk_id: 'a2', material_id: 'm1', material_title: '入门' },
    { chunk_id: 'a3', material_id: 'm1', material_title: '入门' },
    { chunk_id: 'b1', material_id: 'm2', material_title: 'Transformer详解' },
    { chunk_id: 'b2', material_id: 'm2', material_title: 'Transformer详解' },
  ];
  const diversified = diversifyByMaterial(rows, { maxPerMaterial: 2 });
  assert.deepEqual(diversified.map((r) => r.chunk_id), ['a1', 'a2', 'b1', 'b2']);
  assert.deepEqual(countByMaterialTitle(diversified), {
    入门: 2,
    Transformer详解: 2,
  });
});

test('fuseByRrf keeps vector similarity when keyword row carries null similarity', () => {
  const fused = fuseByRrf([
    [{ chunk_id: 'a', content: 'A', similarity: 0.81, material_title: 'T' }],
    [{ chunk_id: 'a', content: 'A', similarity: null, keyword_rank: 4, material_title: 'T' }],
  ]);
  assert.equal(fused[0].chunk_id, 'a');
  assert.equal(fused[0].similarity, 0.81);
  assert.equal(fused[0].keyword_rank, 4);
});

test('fuseByRrf merges lists by reciprocal rank and dedupes chunk_id', () => {
  const fused = fuseByRrf([
    [
      { chunk_id: 'a', content: 'A', similarity: 0.9 },
      { chunk_id: 'b', content: 'B', similarity: 0.8 },
    ],
    [
      { chunk_id: 'b', content: 'B', keyword_rank: 5 },
      { chunk_id: 'c', content: 'C', keyword_rank: 4 },
    ],
  ]);
  assert.equal(fused[0].chunk_id, 'b');
  assert.ok(fused[0].rrf_score > fused[1].rrf_score);
  assert.equal(fused.length, 3);
  assert.equal(fused.find((row) => row.chunk_id === 'b').similarity, 0.8);
  assert.equal(fused.find((row) => row.chunk_id === 'b').keyword_rank, 5);
});

test('lightRerank returns at most 5 and can keep same-material chunks within topK', () => {
  const candidates = [];
  for (let i = 0; i < 8; i += 1) {
    candidates.push({
      chunk_id: `c${i}`,
      material_id: i < 6 ? 'm1' : `m${i}`,
      material_title: 'RAG 指南',
      content: `RAG 检索 重排 片段${i}`,
      similarity: 0.9 - i * 0.05,
      keyword_rank: 3,
      rrf_score: 0.03,
    });
  }
  const ranked = lightRerank(candidates, 'RAG 检索 重排', { topK: 5, maxPerMaterial: 5 });
  assert.equal(ranked.length, 5);
  assert.ok(ranked.every((row) => typeof row.rerank_score === 'number'));
  assert.equal(ranked.filter((row) => row.material_id === 'm1').length, 5);
});

test('lightRerank still respects a tighter maxPerMaterial when provided', () => {
  const candidates = [];
  for (let i = 0; i < 8; i += 1) {
    candidates.push({
      chunk_id: `c${i}`,
      material_id: i < 6 ? 'm1' : `m${i}`,
      material_title: 'RAG 指南',
      content: `RAG 检索 重排 片段${i}`,
      similarity: 0.9 - i * 0.05,
      keyword_rank: 3,
      rrf_score: 0.03,
    });
  }
  const ranked = lightRerank(candidates, 'RAG 检索 重排', { topK: 5, maxPerMaterial: 3 });
  assert.equal(ranked.filter((row) => row.material_id === 'm1').length, 3);
});

test('isRetrievalTooWeak is true for empty or weak top hit', () => {
  assert.equal(isRetrievalTooWeak([]), true);
  assert.equal(isRetrievalTooWeak([{
    similarity: 0.1,
    keyword_rank: 0,
    rerank_score: 0.1,
    material_title: '无关',
    content: '无关正文',
  }], { queryText: '完全不同的问题' }), true);
});

test('isRetrievalTooWeak is false for strong vector or keyword hit', () => {
  assert.equal(isRetrievalTooWeak([{
    similarity: 0.55,
    keyword_rank: 0,
    rerank_score: 0.4,
    material_title: '文档',
    content: '内容',
  }], { queryText: '问题' }), false);
  assert.equal(isRetrievalTooWeak([{
    similarity: 0.15,
    keyword_rank: 4,
    rerank_score: 0.5,
    material_title: 'RAG 指南',
    content: 'RAG 检索',
  }], { queryText: 'RAG 检索' }), false);
});

test('buildRagSystemPrompt embeds fixed rules and numbered snippets', () => {
  const prompt = buildRagSystemPrompt([
    { index: 1, title: '文档A', content: '片段一' },
    { index: 2, title: '文档B', content: '片段二' },
  ]);
  assert.ok(prompt.startsWith(RAG_SYSTEM_RULES));
  assert.match(prompt, /\[1\] 《文档A》\n片段一/);
  assert.match(prompt, /\[2\] 《文档B》\n片段二/);
  assert.match(prompt, /资料片段/);
  assert.match(prompt, /暂无相关资料/);
  assert.match(prompt, /\[1\]\[2\]\[3\]/);
  assert.match(prompt, /多文档信息冲突/);
});

test('logRagDebug prints pipeline stages', () => {
  const lines = [];
  const logger = { log: (...args) => lines.push(args.map(String).join(' ')) };
  logRagDebug({
    logger,
    userQuestion: 'Q',
    retrievalQuery: 'H\nQ',
    vectorHits: [{ chunk_id: 'v1', similarity: 0.5, material_title: 'T', content: 'C' }],
    keywordHits: [{ chunk_id: 'k1', keyword_rank: 3, material_title: 'T', content: 'C' }],
    rrfFused: [{ chunk_id: 'v1', rrf_score: 0.02, material_title: 'T', content: 'C' }],
    reranked: [{ chunk_id: 'v1', rerank_score: 0.4, material_title: 'T', content: 'C' }],
    topChunks: [{ chunk_id: 'v1', material_title: 'T', content: 'C' }],
    fullLlmPrompt: 'SYSTEM\nUSER',
    llmRaw: '答案[1]',
  });
  const joined = lines.join('\n');
  assert.match(joined, /user_question=/);
  assert.match(joined, /retrieval_query=/);
  assert.match(joined, /vector_hits=/);
  assert.match(joined, /keyword_hits=/);
  assert.match(joined, /rrf_fused=/);
  assert.match(joined, /reranked=/);
  assert.match(joined, /top5=/);
  assert.match(joined, /full_llm_prompt=/);
  assert.match(joined, /llm_raw=/);
});

test('applyExternalRerank reorders by API scores, drops below floor, keeps topK', () => {
  const candidates = [
    { chunk_id: 'a', material_id: 'm1', content: 'A', similarity: 0.5 },
    { chunk_id: 'b', material_id: 'm2', content: 'B', similarity: 0.4 },
    { chunk_id: 'c', material_id: 'm3', content: 'C', similarity: 0.3 },
  ];
  const ranked = applyExternalRerank(candidates, [
    { index: 2, relevance_score: 0.91 },
    { index: 0, relevance_score: 0.55 },
    { index: 1, relevance_score: 0.22 },
  ], { topK: 2, scoreFloor: 0.4 });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].chunk_id, 'c');
  assert.equal(ranked[0].rerank_score, 0.91);
  assert.equal(ranked[1].chunk_id, 'a');
  assert.ok(!ranked.some((row) => row.chunk_id === 'b'));
});

test('rerankCandidatesWithFallback uses bailian then falls back on failure', async () => {
  const candidates = [
    { chunk_id: 'a', material_id: 'm1', material_title: 'T', content: 'RAG 检索', similarity: 0.6 },
    { chunk_id: 'b', material_id: 'm2', material_title: 'T2', content: '无关', similarity: 0.2 },
  ];
  const ok = await rerankCandidatesWithFallback(candidates, 'RAG 检索', {
    topK: 1,
    rerankFn: async () => [{ index: 0, relevance_score: 0.88 }],
  });
  assert.equal(ok.provider, 'bailian');
  assert.equal(ok.ranked[0].chunk_id, 'a');

  const lines = [];
  const failed = await rerankCandidatesWithFallback(candidates, 'RAG 检索', {
    topK: 1,
    logger: { log: (...args) => lines.push(args.join(' ')) },
    rerankFn: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(failed.provider, 'light_fallback');
  assert.match(lines.join('\n'), /bailian_rerank_failed/);
});

test('bailian path requests full candidate scoring then applies floor', async () => {
  let seenTopN = null;
  const candidates = Array.from({ length: 5 }, (_, i) => ({
    chunk_id: `c${i}`,
    material_id: `m${i}`,
    material_title: 'T',
    content: `内容${i}`,
    similarity: 0.5,
  }));
  const result = await rerankCandidatesWithFallback(candidates, '问题', {
    topK: 8,
    scoreFloor: 0.4,
    rerankFn: async (_q, docs, opts) => {
      seenTopN = opts.topN;
      return docs.map((_, index) => ({
        index,
        relevance_score: index === 0 ? 0.9 : 0.1,
      }));
    },
  });
  assert.equal(seenTopN, 5);
  assert.equal(result.provider, 'bailian');
  assert.equal(result.ranked.length, 1);
  assert.equal(result.ranked[0].chunk_id, 'c0');
});
