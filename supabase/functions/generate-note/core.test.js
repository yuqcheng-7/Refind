import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChaptersForPrompt,
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
  assert.deepEqual(normalizeRequestBody({ noteId: '  note-1  ' }), { noteId: 'note-1', lang: 'zh' });
  assert.deepEqual(normalizeRequestBody({ noteId: 'n1', lang: 'en' }), { noteId: 'n1', lang: 'en' });
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

test('buildChaptersForPrompt appends 未归章 for unassigned and orphan cards', () => {
  const outline = {
    version: 1,
    chapters: [
      { id: 'c1', title: '开场', cardIds: ['a'] },
      { id: 'c2', title: '空章', cardIds: [] },
    ],
    unassignedCardIds: ['u', 'b'],
  };
  const cards = [
    { id: 'a', content_snapshot: 'A' },
    { id: 'b', content_snapshot: 'B' },
    { id: 'u', content_snapshot: 'U' },
  ];
  const ordered = orderCardsByOutline(cards, outline);
  const chapters = buildChaptersForPrompt(outline, ordered);

  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, '开场');
  assert.deepEqual(chapters[0].cards.map((card) => card.id), ['a']);
  assert.equal(chapters[1].title, '未归章');
  assert.deepEqual(chapters[1].cards.map((card) => card.id), ['u', 'b']);
});

test('buildChaptersForPrompt returns undefined without a valid outline', () => {
  assert.equal(buildChaptersForPrompt(null, [{ id: 'a' }]), undefined);
  assert.equal(buildChaptersForPrompt({ version: 2 }, [{ id: 'a' }]), undefined);
});

test('buildChaptersForPrompt places orphan cards in 未归章 after chapter cards', () => {
  const outline = {
    version: 1,
    chapters: [{ id: 'c1', title: '章', cardIds: ['a'] }],
    unassignedCardIds: [],
  };
  const cards = [{ id: 'a' }, { id: 'orphan' }];
  const ordered = orderCardsByOutline(cards, outline);
  const chapters = buildChaptersForPrompt(outline, ordered);

  assert.equal(chapters.length, 2);
  assert.equal(chapters[1].title, '未归章');
  assert.deepEqual(chapters[1].cards.map((card) => card.id), ['orphan']);
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

test('buildPromptPayload truncates long card fields for faster generation', () => {
  const longContent = '内容'.repeat(1200);
  const payload = buildPromptPayload({
    title: '增长笔记',
    cards: [
      {
        id: 'c1',
        answer_mode: 'rag',
        content_snapshot: longContent,
        source_question_snapshot: '问题'.repeat(200),
        citation_snapshot: [{ order: 1, label: '资料A' }],
        user_thought: '想法'.repeat(250),
      },
    ],
  });

  assert.ok(payload.cards[0].content.length <= 1800);
  assert.ok(payload.cards[0].question.length <= 240);
  assert.ok(payload.cards[0].thought.length <= 320);
  assert.match(payload.cards[0].content, /…$/);
});

test('buildNoteContentFromAi keeps bullet and ordered lists', () => {
  const content = buildNoteContentFromAi({
    sections: [
      { type: 'paragraph', text: '先看全局。' },
      { type: 'bullet_list', items: ['资讯源', '系统学习', '动手实践'] },
      { type: 'ordered_list', items: ['理解边界', '搭知识库'] },
    ],
  }, []);
  assert.equal(content.sections[1].type, 'bullet_list');
  assert.deepEqual(content.sections[1].items, ['资讯源', '系统学习', '动手实践']);
  assert.equal(content.sections[2].type, 'ordered_list');
  assert.match(content.text, /• 资讯源/);
  assert.match(content.text, /1\. 理解边界/);
});

test('buildNoteContentFromAi renders 一、二、三 headings as h2 html', () => {
  const content = buildNoteContentFromAi({
    sections: [
      { type: 'paragraph', text: '开篇说明。' },
      { type: 'heading', level: 2, text: '一、核心技术认知' },
      { type: 'paragraph', text: '展开叙述。' },
      { type: 'heading', level: 2, text: '二、职业方向选择' },
    ],
  }, []);
  assert.equal(content.sections[1].type, 'heading');
  assert.equal(content.sections[1].text, '一、核心技术认知');
  assert.match(content.html, /<h2>一、核心技术认知<\/h2>/);
  assert.match(content.html, /<h2>二、职业方向选择<\/h2>/);
});

test('buildGenerateMessages explains chapter ordering when chapters are present', () => {
  const [system] = buildGenerateMessages({
    title: 't',
    lang: 'zh',
    totalCardNum: 2,
    chapters: [{ title: '开场', cards: [{ id: 'a' }] }],
  });
  assert.match(system.content, /存在 chapters/);
  assert.match(system.content, /独有/);
  assert.match(system.content, /heading|二级标题/);
});

test('buildGenerateMessages asks for full prose plus unique-point coverage', () => {
  const [system] = buildGenerateMessages({
    title: 't',
    lang: 'zh',
    totalCardNum: 3,
    cards: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  });
  assert.match(system.content, /本次共有 3 张灵感卡片/);
  assert.match(system.content, /独有/);
  assert.match(system.content, /无 chapters/);
  assert.match(system.content, /lang=zh/);
  assert.match(system.content, /该分点处分点/);
  assert.match(system.content, /分点强制规则/);
  assert.match(system.content, /段落强制规则/);
  assert.match(system.content, /合理展开/);
});

test('buildGenerateMessages switches to English mode guidance when lang=en', () => {
  const [system] = buildGenerateMessages({
    title: 't',
    lang: 'en',
    totalCardNum: 1,
    cards: [{ id: 'a' }],
  });
  assert.match(system.content, /根据 en 生成/);
  assert.match(system.content, /Chapter 1/);
  assert.match(system.content, /学术笔记风格/);
});

test('buildPromptPayload includes lang and totalCardNum', () => {
  const payload = buildPromptPayload({
    title: 't',
    lang: 'en',
    cards: [
      { id: 'c1', content_snapshot: 'a' },
      { id: 'c2', content_snapshot: 'b' },
    ],
  });
  assert.equal(payload.lang, 'en');
  assert.equal(payload.totalCardNum, 2);
});

test('buildPromptPayload marks regenerate when previousNote is provided', () => {
  const payload = buildPromptPayload({
    title: 't',
    cards: [{ id: 'c1', content_snapshot: '内容' }],
    previousNote: '旧稿正文'.repeat(20),
  });
  assert.equal(payload.regenerate, true);
  assert.ok(payload.previousNote.length > 0);
  const [system] = buildGenerateMessages(payload);
  assert.match(system.content, /regenerate=true/);
});
