/**
 * Pure helpers for generate-note Edge Function.
 * Keep Deno-free so node:test can exercise the mapper.
 */

export function normalizeRequestBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request body must be an object');
  }
  const noteId = typeof value.noteId === 'string' ? value.noteId.trim() : '';
  if (!noteId) throw new Error('noteId is required');
  return { noteId };
}

export function parseAiJson(raw) {
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

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
    throw new Error('AI JSON must include a sections array');
  }
  return parsed;
}

function citationLabelForCard(card) {
  if (!card || card.answer_mode !== 'rag') return undefined;
  const snapshot = Array.isArray(card.citation_snapshot) ? card.citation_snapshot : [];
  const first = snapshot[0];
  if (first?.label) return String(first.label);
  return '知识库回答';
}

function normalizeOutline(outline) {
  if (!outline || typeof outline !== 'object' || outline.version !== 1 || !Array.isArray(outline.chapters)) {
    return undefined;
  }

  const chapters = outline.chapters
    .filter((chapter) => chapter && typeof chapter.id === 'string' && typeof chapter.title === 'string')
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      cardIds: Array.isArray(chapter.cardIds)
        ? chapter.cardIds.filter((id) => typeof id === 'string')
        : [],
    }));
  if (!chapters.length) return undefined;

  return {
    version: 1,
    chapters,
    unassignedCardIds: Array.isArray(outline.unassignedCardIds)
      ? outline.unassignedCardIds.filter((id) => typeof id === 'string')
      : [],
    ...(typeof outline.updatedAt === 'string' ? { updatedAt: outline.updatedAt } : {}),
  };
}

const UNASSIGNED_CHAPTER_TITLE = '未归章';

export function buildChaptersForPrompt(outline, orderedCards = []) {
  const normalized = normalizeOutline(outline);
  if (!normalized) return undefined;

  const byId = new Map((orderedCards || []).map((card) => [card.id, card]));
  const placed = new Set();
  const chapters = [];

  for (const chapter of normalized.chapters) {
    const cards = (chapter.cardIds || [])
      .map((id) => {
        if (placed.has(id) || !byId.has(id)) return null;
        placed.add(id);
        return byId.get(id);
      })
      .filter(Boolean);
    if (cards.length) {
      chapters.push({ title: chapter.title, cards });
    }
  }

  const remainingCards = (orderedCards || []).filter((card) => !placed.has(card.id));
  if (remainingCards.length) {
    chapters.push({ title: UNASSIGNED_CHAPTER_TITLE, cards: remainingCards });
  }

  return chapters.length ? chapters : undefined;
}

export function orderCardsByOutline(cards = [], outline) {
  const input = Array.isArray(cards) ? cards : [];
  const normalized = normalizeOutline(outline);
  if (!normalized) return input;

  const byId = new Map(input.map((card) => [card.id, card]));
  const orderedIds = [
    ...normalized.chapters.flatMap((chapter) => chapter.cardIds),
    ...normalized.unassignedCardIds,
  ];
  const ordered = [];
  const seen = new Set();
  for (const id of orderedIds) {
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    ordered.push(byId.get(id));
  }
  for (const card of input) {
    if (!seen.has(card.id)) ordered.push(card);
  }
  return ordered;
}

function promptCard(card, index) {
  return {
    id: card.id,
    order: index + 1,
    answerMode: card.answer_mode === 'rag' ? 'rag' : 'general',
    question: card.source_question_snapshot || '',
    content: card.content_snapshot || '',
    thought: card.user_thought || '',
    citationLabel: citationLabelForCard(card) || null,
  };
}

/**
 * Map model JSON + card metadata → notes.content shape.
 * RAG sections keep cardId + citationLabel from the card snapshot.
 * General cards may keep cardId but never invent material citations.
 */
export function buildNoteContentFromAi(ai, cards = []) {
  const byId = new Map((cards || []).map((card) => [card.id, card]));
  const sections = [];

  for (const row of ai?.sections || []) {
    if (!row || typeof row !== 'object') continue;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;

    const section = { type: 'paragraph', text };
    const cardId = typeof row.cardId === 'string' ? row.cardId.trim() : '';
    const card = cardId ? byId.get(cardId) : null;

    if (card) {
      section.cardId = card.id;
      if (card.answer_mode === 'rag') {
        const citationIndex = Number(row.citationIndex);
        section.citationIndex = Number.isFinite(citationIndex) && citationIndex > 0
          ? Math.floor(citationIndex)
          : 1;
        section.citationLabel = citationLabelForCard(card);
      }
      // general: cardId only — no citationIndex / citationLabel / materialId
    }

    sections.push(section);
  }

  if (!sections.length) {
    throw new Error('AI produced no usable sections');
  }

  const blocks = sections
    .filter((section) => section.cardId && section.citationLabel)
    .map((section) => ({
      text: section.text,
      cardId: section.cardId,
      citationLabel: section.citationLabel,
      citationIndex: section.citationIndex,
    }));

  return {
    text: sections.map((section) => section.text).join('\n\n'),
    blocks,
    sections,
  };
}

export function buildPromptPayload({ title, cards = [], chapters } = {}) {
  const payload = {
    title: title || '未命名笔记',
  };
  if (Array.isArray(chapters) && chapters.length) {
    payload.chapters = chapters.map((chapter) => ({
      title: chapter.title || '未命名章节',
      cards: (chapter.cards || []).map(promptCard),
    }));
  } else {
    payload.cards = (cards || []).map(promptCard);
  }
  return payload;
}

export function buildGenerateMessages(payload) {
  const system = [
    '你是笔记写作助手。根据用户提供的灵感卡片，整理成一篇连贯中文笔记。',
    '只输出 JSON，不要 markdown 说明。格式：',
    '{"sections":[{"type":"paragraph","text":"...","cardId":"可选","citationIndex":1}]}',
    '规则：',
    '1. sections 至少 3 段：开场、分点展开、收束建议。',
    '2. 引用某张卡片论据时，必须带上该卡片的 id 作为 cardId。',
    '3. answerMode=rag 的卡片可设 citationIndex（从 1 起，对应该卡在列表中的顺序）。',
    '4. answerMode=general 的卡片可以带 cardId，但不要编造资料引用。',
    '5. 不要输出 materialId；不要杜撰卡片里没有的事实。',
    '6. text 写完整段落，不要在正文里写 [1] 标记。',
  ].join('\n');
  const chapterInstruction = Array.isArray(payload?.chapters) && payload.chapters.length
    ? '\n当输入包含 chapters 时，必须按 chapters 数组顺序写作；每章先形成过渡或小标题语义，再展开该章 cards。跳过空章节，不要使用未出现的 cardId。'
    : '\n当输入没有 chapters 时，按 cards 的顺序遵循旧的扁平写作规则。';

  return [
    { role: 'system', content: system + chapterInstruction },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

export function normalizeNoteContent(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content)
    ? content
    : {};
  const outline = normalizeOutline(value.outline);
  const next = {
    ...value,
    text: typeof value.text === 'string' ? value.text : '',
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    sections: Array.isArray(value.sections) ? value.sections : [],
  };
  if (outline) next.outline = outline;
  else delete next.outline;
  return next;
}
