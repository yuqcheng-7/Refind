/**
 * Pure helpers for outline-note-materials Edge Function.
 * Keep Deno-free so node:test can exercise the mapper.
 */

export function normalizeOutlineRequestBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request body must be an object');
  }
  const noteId = typeof value.noteId === 'string' ? value.noteId.trim() : '';
  if (!noteId) throw new Error('noteId is required');
  return { noteId };
}

export function parseOutlineAiJson(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('AI returned empty content');

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI response is not valid JSON');
    parsed = JSON.parse(candidate.slice(start, end + 1));
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.chapters)) {
    throw new Error('AI JSON must include a chapters array');
  }
  return parsed;
}

/**
 * Map model JSON + known card ids → notes.content.outline shape.
 * Drops unknown ids, dedupes across chapters, parks leftovers in unassignedCardIds.
 */
export function buildOutlineFromAi(ai, cardIds = []) {
  const known = [];
  const knownSet = new Set();
  for (const id of cardIds || []) {
    if (typeof id !== 'string' || !id || knownSet.has(id)) continue;
    knownSet.add(id);
    known.push(id);
  }

  const placed = new Set();
  const chapters = [];

  for (const row of ai?.chapters || []) {
    if (!row || typeof row !== 'object') continue;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (!title) continue;

    const chapterCardIds = [];
    const rawIds = Array.isArray(row.cardIds) ? row.cardIds : [];
    for (const raw of rawIds) {
      if (typeof raw !== 'string' || !raw) continue;
      if (!knownSet.has(raw) || placed.has(raw)) continue;
      placed.add(raw);
      chapterCardIds.push(raw);
    }

    chapters.push({
      id: `ch-${chapters.length + 1}`,
      title,
      cardIds: chapterCardIds,
    });
  }

  if (!chapters.length) {
    throw new Error('AI produced no usable chapters');
  }

  const unassignedCardIds = known.filter((id) => !placed.has(id));

  return {
    version: 1,
    chapters,
    unassignedCardIds,
  };
}

export function buildOutlinePromptPayload({ title, cards = [] } = {}) {
  return {
    title: title || '未命名笔记',
    cards: (cards || []).map((card, index) => ({
      id: card.id,
      order: index + 1,
      question: card.source_question_snapshot || '',
      content: card.content_snapshot || '',
      thought: card.user_thought || '',
    })),
  };
}

export function buildOutlineMessages(payload) {
  const system = [
    '你是笔记成章助手。根据用户提供的灵感卡片，把卡片聚类成章节大纲（不成文）。',
    '只输出 JSON，不要 markdown 说明。格式：',
    '{"chapters":[{"title":"...","cardIds":["..."]}]}',
    '规则：',
    '1. 目标 3～5 章（允许 2～6）；按叙事顺序排列章节。',
    '2. 每张输入卡最多出现一次；勿编造 cardId；只用输入里给出的 id。',
    '3. 用卡片内容语义聚类成叙事顺序，不要按收藏时间或 order 字段排序。',
    '4. title 用简短中文章节名；cardIds 为该章引用的卡片 id 列表。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

export function normalizeNoteContent(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content)
    ? content
    : {};
  return {
    ...value,
    text: typeof value.text === 'string' ? value.text : '',
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    sections: Array.isArray(value.sections) ? value.sections : [],
  };
}
