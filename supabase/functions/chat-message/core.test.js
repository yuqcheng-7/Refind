import assert from 'node:assert/strict';
import test from 'node:test';
import * as core from './core.js';
import {
  buildCitationRows,
  buildRetrievalSummary,
  normalizeRequestBody,
  sanitizeAnswerCitations,
  selectUsableChunks,
} from './core.js';

const chunks = [
  {
    chunk_id: 'chunk-1',
    material_id: 'material-1',
    knowledge_base_id: 'kb-1',
    content: '第一段资料',
    similarity: 0.73,
    material_title: '资料一',
    knowledge_base_name: '知识库一',
  },
  {
    chunk_id: 'chunk-2',
    material_id: 'material-2',
    knowledge_base_id: 'kb-1',
    content: '第二段资料',
    similarity: 0.2,
    material_title: '资料二',
    knowledge_base_name: '知识库一',
  },
  {
    chunk_id: 'chunk-3',
    material_id: 'material-3',
    knowledge_base_id: 'kb-2',
    content: '低相关资料',
    similarity: 0.19,
    material_title: '资料三',
    knowledge_base_name: '知识库二',
  },
];

test('normalizes supported request fields and ignores client answer mode', () => {
  assert.deepEqual(normalizeRequestBody({
    conversationId: ' conversation-1 ',
    content: '  问题内容  ',
    thinkingMode: 'deep',
    onlineEnabled: true,
    knowledgeBaseIds: ['kb-1', 'kb-1', '', 3],
    tagFilters: ['tag-1'],
    surface: 'home',
    answer_mode: 'rag',
  }), {
    conversationId: 'conversation-1',
    content: '问题内容',
    thinkingMode: 'deep',
    onlineEnabled: true,
    knowledgeBaseIds: ['kb-1'],
    tagFilters: ['tag-1'],
    surface: 'home',
  });
});

test('knowledge requests require at least one knowledge base', () => {
  assert.throws(
    () => normalizeRequestBody({ content: '问题', surface: 'knowledge', knowledgeBaseIds: [] }),
    /knowledgeBaseId/,
  );
});

test('rejects empty content and unsupported surfaces', () => {
  assert.throws(() => normalizeRequestBody({ content: ' ', surface: 'home' }), /content/);
  assert.throws(() => normalizeRequestBody({ content: '问题', surface: 'other' }), /surface/);
});

test('reuses conversation only when surface and knowledge base match', () => {
  assert.equal(
    core.shouldReuseConversation(
      { surface: 'home', knowledge_base_id: null },
      { surface: 'home', knowledgeBaseIds: [] },
    ),
    true,
  );
  assert.equal(
    core.shouldReuseConversation(
      { surface: 'home', knowledge_base_id: null },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-1'] },
    ),
    false,
  );
  assert.equal(
    core.shouldReuseConversation(
      { surface: 'knowledge', knowledge_base_id: 'kb-1' },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-1'] },
    ),
    true,
  );
  assert.equal(
    core.shouldReuseConversation(
      { surface: 'knowledge', knowledge_base_id: 'kb-1' },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-2'] },
    ),
    false,
  );
});

test('empty drafts can rebind to the request surface and knowledge base', () => {
  assert.equal(
    core.canRebindEmptyConversation(
      { surface: 'home', knowledge_base_id: null, title: '新会话' },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-1'] },
      0,
    ),
    true,
  );
  assert.equal(
    core.canRebindEmptyConversation(
      { surface: 'home', knowledge_base_id: null, title: '新会话' },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-1'] },
      1,
    ),
    false,
  );
  assert.deepEqual(
    core.buildConversationRebindPatch(
      { surface: 'home', knowledge_base_id: null, title: '新会话' },
      { surface: 'knowledge', knowledgeBaseIds: ['kb-1'], content: '训练营介绍' },
    ),
    {
      surface: 'knowledge',
      knowledge_base_id: 'kb-1',
      title: '训练营介绍',
    },
  );
});

test('placeholder titles are detected for first-message renaming', () => {
  assert.equal(core.isPlaceholderTitle('新会话'), true);
  assert.equal(core.isPlaceholderTitle('未命名会话'), true);
  assert.equal(core.isPlaceholderTitle('真实标题'), false);
});

test('keeps chunks at or above the soft similarity floor', () => {
  assert.deepEqual(
    selectUsableChunks(chunks, 0.2).map((chunk) => chunk.chunk_id),
    ['chunk-1', 'chunk-2'],
  );
});

test('builds citation snapshots only for valid unique marker orders', () => {
  assert.deepEqual(buildCitationRows('assistant-1', [2, 2, 4, 1], chunks.slice(0, 2), '根据第二段资料[2]和第一段[1]'), [
    {
      message_id: 'assistant-1',
      material_id: 'material-2',
      knowledge_base_name_snapshot: '知识库一',
      material_title_snapshot: '资料二',
      excerpt: '第二段资料',
      citation_order: 2,
    },
    {
      message_id: 'assistant-1',
      material_id: 'material-1',
      knowledge_base_name_snapshot: '知识库一',
      material_title_snapshot: '资料一',
      excerpt: '第一段资料',
      citation_order: 1,
    },
  ]);
});

test('removes out-of-range citation markers and returns valid orders', () => {
  assert.deepEqual(sanitizeAnswerCitations('有效引用[1]，编造引用[9]。', 2), {
    content: '有效引用[1]，编造引用。',
    orders: [1],
  });
});

test('deduplicates valid citation orders while preserving answer markers', () => {
  assert.deepEqual(sanitizeAnswerCitations('先看[2]，再看[1]和[2]。', 2), {
    content: '先看[2]，再看[1]和[2]。',
    orders: [2, 1],
  });
});

test('removes every numeric marker when no chunks were retrieved', () => {
  assert.deepEqual(sanitizeAnswerCitations('没有依据[1]，也没有依据[0]。', 0), {
    content: '没有依据，也没有依据。',
    orders: [],
  });
});

test('leaves non-citation brackets unchanged', () => {
  assert.deepEqual(sanitizeAnswerCitations('保留[附录]与普通文本。', 2), {
    content: '保留[附录]与普通文本。',
    orders: [],
  });
});

test('treats a retrieved RAG answer without citation markers as insufficient', () => {
  assert.deepEqual(core.resolveRagAnswerOutcome?.({
    answer: '这是没有引用标记的回答。',
    chunks: chunks.slice(0, 2),
  }), {
    content: '当前范围内资料不足，暂时无法可靠回答。请补充资料或调整知识库与标签范围。',
    isInsufficient: true,
    orders: [],
  });
});

test('keeps a retrieved RAG answer with a valid citation as sufficient', () => {
  assert.deepEqual(core.resolveRagAnswerOutcome?.({
    answer: '依据第一段资料可知答案。[1]',
    chunks: chunks.slice(0, 2),
  }), {
    content: '依据第一段资料可知答案。[1]',
    isInsufficient: false,
    orders: [1],
  });
});

test('summarizes distinct knowledge bases and materials', () => {
  assert.deepEqual(buildRetrievalSummary(chunks.slice(0, 2)), {
    knowledgeBaseCount: 1,
    materialCount: 2,
    chunkCount: 2,
  });
});
