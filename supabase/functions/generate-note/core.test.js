import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNoteContentFromAi,
  buildPromptPayload,
  buildGenerateMessages,
  normalizeNoteContent,
  normalizeRequestBody,
  parseAiJson,
  orderCardsByOutline,
} from './core.js';

test('normalizeRequestBody requires noteId', () => {
  assert.throws(() => normalizeRequestBody({}), /noteId/);
  assert.deepEqual(normalizeRequestBody({ noteId: '  note-1  ' }), { noteId: 'note-1' });
});

test('parseAiJson extracts sections object from fenced or raw JSON', () => {
  const raw = parseAiJson('{"sections":[{"type":"paragraph","text":"你好"}]}');
  assert.equal(raw.sections[0].text, '你好');

  const fenced = parseAiJson('```json\n{"sections":[{"type":"paragraph","text":"围栏"}]}\n```');
  assert.equal(fenced.sections[0].text, '围栏');
});

test('maps AI JSON to sections with cardId + citation for RAG; no fake material for general', () => {
  const cards = [
    {
      id: 'rag-card',
      answer_mode: 'rag',
      content_snapshot: '缩短首次价值时间。',
      citation_snapshot: [{ order: 1, label: '小红书增长策略', materialId: 'mat-1' }],
    },
    {
      id: 'general-card',
      answer_mode: 'general',
      content_snapshot: '保持复盘节奏。',
      citation_snapshot: null,
    },
  ];

  const ai = {
    sections: [
      { type: 'paragraph', text: '可以把两张卡片收成一条主线。' },
      { type: 'paragraph', text: '先缩短首次价值时间。', cardId: 'rag-card', citationIndex: 1 },
      { type: 'paragraph', text: '再保持复盘节奏。', cardId: 'general-card' },
    ],
  };

  const content = buildNoteContentFromAi(ai, cards);

  assert.equal(content.sections.length, 3);
  assert.equal(content.sections[0].type, 'paragraph');
  assert.equal(content.sections[0].cardId, undefined);

  assert.equal(content.sections[1].cardId, 'rag-card');
  assert.equal(content.sections[1].citationIndex, 1);
  assert.equal(content.sections[1].citationLabel, '小红书增长策略');
  assert.equal(content.sections[1].materialId, undefined);

  assert.equal(content.sections[2].cardId, 'general-card');
  assert.equal(content.sections[2].citationLabel, undefined);
  assert.equal(content.sections[2].citationIndex, undefined);
  assert.equal(content.sections[2].materialId, undefined);

  assert.match(content.text, /主线/);
  assert.equal(content.blocks.length, 1);
  assert.equal(content.blocks[0].cardId, 'rag-card');
});

test('buildPromptPayload includes ordered cards and thoughts for the model', () => {
  const payload = buildPromptPayload({
    title: '增长笔记',
    cards: [
      {
        id: 'c1',
        answer_mode: 'rag',
        content_snapshot: '内容A',
        source_question_snapshot: '问题A',
        citation_snapshot: [{ order: 1, label: '资料A' }],
        user_thought: '我想强调激活',
      },
    ],
  });

  assert.equal(payload.title, '增长笔记');
  assert.equal(payload.cards[0].id, 'c1');
  assert.equal(payload.cards[0].thought, '我想强调激活');
  assert.equal(payload.cards[0].answerMode, 'rag');
});

test('orderCardsByOutline follows chapters then unassigned', () => {
  const cards = [{ id: 'b' }, { id: 'a' }, { id: 'u' }];
  const ordered = orderCardsByOutline(cards, {
    version: 1,
    chapters: [
      { id: 'c1', title: '一', cardIds: ['a'] },
      { id: 'c2', title: '二', cardIds: [] },
      { id: 'c3', title: '三', cardIds: ['b'] },
    ],
    unassignedCardIds: ['u'],
  });
  assert.deepEqual(ordered.map((card) => card.id), ['a', 'b', 'u']);
});

test('buildPromptPayload includes chapters when provided', () => {
  const payload = buildPromptPayload({
    title: 't',
    cards: [{ id: 'a', content_snapshot: '内容A' }],
    chapters: [{ title: '动机', cards: [{ id: 'a', content_snapshot: '内容A' }] }],
  });
  assert.equal(payload.chapters[0].title, '动机');
  assert.equal(payload.chapters[0].cards[0].id, 'a');
  assert.equal(payload.cards, undefined);
});

test('normalizeNoteContent preserves a valid outline and drops an invalid one', () => {
  const valid = normalizeNoteContent({
    text: '',
    outline: {
      version: 1,
      chapters: [{ id: 'c1', title: '开场', cardIds: ['a'] }],
      unassignedCardIds: [],
    },
  });
  assert.equal(valid.outline.chapters[0].title, '开场');
  assert.equal(normalizeNoteContent({ outline: { version: 2 } }).outline, undefined);
});

test('buildGenerateMessages explains chapter ordering when chapters are present', () => {
  const [system] = buildGenerateMessages({
    title: 't',
    chapters: [{ title: '开场', cards: [] }],
  });
  assert.match(system.content, /chapters 数组顺序/);
});
