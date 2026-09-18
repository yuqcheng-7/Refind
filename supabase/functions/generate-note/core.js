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
  const lang = normalizeNoteLang(value.lang);
  return { noteId, lang };
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

function clipPromptText(value, maxChars) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function promptCard(card, index) {
  return {
    id: card.id,
    order: index + 1,
    answerMode: card.answer_mode === 'rag' ? 'rag' : 'general',
    question: clipPromptText(card.source_question_snapshot, 240),
    content: clipPromptText(card.content_snapshot, 1800),
    thought: clipPromptText(card.user_thought, 320),
    citationLabel: citationLabelForCard(card) || null,
  };
}

/**
 * Map model JSON + card metadata → notes.content shape.
 * RAG sections keep cardId + citationLabel from the card snapshot.
 * General cards may keep cardId but never invent material citations.
 * Lists: type bullet_list | ordered_list with items[].
 * Headings: type heading with text like「一、模块名」(renders as h2).
 */
export function buildNoteContentFromAi(ai, cards = []) {
  const byId = new Map((cards || []).map((card) => [card.id, card]));
  const sections = [];

  for (const row of ai?.sections || []) {
    if (!row || typeof row !== 'object') continue;
    const listType = row.type === 'bullet_list' || row.type === 'ordered_list'
      ? row.type
      : null;

    if (listType) {
      const items = (Array.isArray(row.items) ? row.items : [])
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
      if (!items.length) continue;
      const section = { type: listType, items };
      attachCardMeta(section, row, byId, cards);
      sections.push(section);
      continue;
    }

    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;

    if (row.type === 'heading') {
      const level = Number(row.level);
      sections.push({
        type: 'heading',
        level: level === 3 ? 3 : 2,
        text,
      });
      continue;
    }

    const section = { type: 'paragraph', text };
    attachCardMeta(section, row, byId, cards);
    sections.push(section);
  }

  if (!sections.length) {
    throw new Error('AI produced no usable sections');
  }

  const blocks = sections
    .filter((section) => section.cardId && section.citationLabel && section.text)
    .map((section) => ({
      text: section.text,
      cardId: section.cardId,
      citationLabel: section.citationLabel,
      citationIndex: section.citationIndex,
    }));

  return {
    text: sections.map((section) => sectionTextPlain(section)).join('\n\n'),
    blocks,
    sections,
    html: htmlFromSections(sections),
  };
}

export function htmlFromSections(sections = []) {
  return (sections || []).map((section) => {
    if (section?.type === 'heading') {
      const text = escapeHtml(section?.text || '');
      if (!text) return '';
      const level = section.level === 3 ? 3 : 2;
      return `<h${level}>${text}</h${level}>`;
    }
    if (section?.type === 'bullet_list' || section?.type === 'ordered_list') {
      const tag = section.type === 'ordered_list' ? 'ol' : 'ul';
      const items = (Array.isArray(section.items) ? section.items : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => `<li><p data-body="body1">${escapeHtml(item)}</p></li>`)
        .join('');
      return items ? `<${tag}>${items}</${tag}>` : '';
    }
    const text = escapeHtml(section?.text || '');
    if (!text) return '';
    if (section?.cardId != null && section?.citationIndex != null) {
      const labelAttr = section.citationLabel
        ? ` data-label="${escapeAttr(section.citationLabel)}"`
        : '';
      return `<p data-body="body1">${text}<span data-citation="${section.citationIndex}" data-card-id="${escapeAttr(section.cardId)}"${labelAttr}>[${section.citationIndex}]</span></p>`;
    }
    return `<p data-body="body1">${text}</p>`;
  }).filter(Boolean).join('') || '<p data-body="body1"></p>';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function attachCardMeta(section, row, byId, cards = []) {
  const rawCardId = typeof row.cardId === 'string' ? row.cardId.trim() : '';
  if (!rawCardId) return;
  const cardIds = rawCardId.split(/[,，\s]+/).map((id) => id.trim()).filter(Boolean);
  const matched = cardIds.map((id) => byId.get(id)).filter(Boolean);
  if (!matched.length) return;
  // Keep first matched id for citation chip UI; multi-id in model output is accepted as provenance.
  const card = matched[0];
  section.cardId = card.id;
  if (matched.some((item) => item.answer_mode === 'rag')) {
    const ragCard = matched.find((item) => item.answer_mode === 'rag') || card;
    const citationIndex = Number(row.citationIndex);
    const fallbackIndex = cards.findIndex((item) => item.id === ragCard.id) + 1;
    section.citationIndex = Number.isFinite(citationIndex) && citationIndex > 0
      ? Math.floor(citationIndex)
      : (fallbackIndex > 0 ? fallbackIndex : 1);
    section.citationLabel = citationLabelForCard(ragCard);
  }
}

function sectionTextPlain(section) {
  if (section.type === 'heading') {
    return section.text || '';
  }
  if (section.type === 'bullet_list') {
    return (section.items || []).map((item) => `• ${item}`).join('\n');
  }
  if (section.type === 'ordered_list') {
    return (section.items || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  }
  return section.text || '';
}

export function normalizeNoteLang(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'en' || raw === 'english') return 'en';
  return 'zh';
}

export function buildPromptPayload({
  title,
  cards = [],
  chapters,
  previousNote,
  lang,
} = {}) {
  const noteLang = normalizeNoteLang(lang);
  const flatCards = Array.isArray(chapters) && chapters.length
    ? chapters.flatMap((chapter) => chapter.cards || [])
    : (cards || []);
  const payload = {
    title: title || (noteLang === 'en' ? 'Untitled note' : '未命名笔记'),
    lang: noteLang,
    totalCardNum: flatCards.length,
  };
  if (Array.isArray(chapters) && chapters.length) {
    payload.chapters = chapters.map((chapter) => ({
      title: chapter.title || (noteLang === 'en' ? 'Untitled chapter' : '未命名章节'),
      cards: (chapter.cards || []).map(promptCard),
    }));
  } else {
    payload.cards = (cards || []).map(promptCard);
  }
  const previous = typeof previousNote === 'string' ? previousNote.trim() : '';
  if (previous) {
    payload.previousNote = previous.slice(0, 1200);
    payload.regenerate = true;
  }
  return payload;
}

export function buildGenerateMessages(payload) {
  const lang = normalizeNoteLang(payload?.lang);
  const totalCardNum = Number.isFinite(Number(payload?.totalCardNum))
    ? Math.max(0, Math.floor(Number(payload.totalCardNum)))
    : countCardsInPayload(payload);
  const hasChapters = Array.isArray(payload?.chapters) && payload.chapters.length > 0;

  const system = [
    `你是知识整理助手。根据 ${lang} 生成结构化笔记：lang=zh 输出通顺严谨的中文笔记，lang=en 输出学术、清晰、地道的英文笔记。`,
    '目标：完整段落叙述 + 该分点处分点；内容饱满连贯；绝对不允许遗漏任何一张卡片里独有的知识点与并列要点。',
    '',
    '【最高优先级强制铁律，必须100%执行，违反即错误】',
    `0. 本次共有 ${totalCardNum} 张灵感卡片。`,
    '1. 知识点重复规则：多张卡片描述同一知识点时，可以合并表述，避免大段重复复述；但是：每张卡片独有的、别的卡片没有的知识点，必须全部保留，严禁丢弃。',
    '2. 但凡卡片内出现：枚举、并列概念、并列功能、步骤、对比项、多条特征（例如 A/B/C/D、步骤1234、多个属性、多个案例），必须全部 N 项完整写出，禁止只写部分、禁止合并省略、禁止归纳删减。',
    '3. 分点强制规则：上述并列/步骤/对比一旦出现（≥2 项），必须用 ordered_list（步骤、顺序）或 bullet_list（并列概念、特征、案例）逐条展开；禁止把 A/B/C 挤进同一段落用顿号或「首先其次」糊弄过去。',
    '4. 段落强制规则：背景、定义、机制、价值、适用边界、总结等叙述性内容，必须用完整段落写透；禁止用列表代替整段讲解；禁止把整篇写成只有标题+bullet 的提纲。',
    '5. 结构配比：每个大标题下先有段落叙述，再在「需要分点」处跟列表；典型模式 = 1–2 段解释 → 列表补齐并列要点 → 可选 1 段收束。二者缺一不可。',
    '6. 不允许判定“内容重复”为理由，直接删掉某张卡片独有的信息。',
    '7. 生成结束前必须隐性自检：对照全部卡片逐一核对，缺哪个独有知识点立刻补全；该分点却写成段落的立刻改回列表；重复内容可以合并精简。',
    '',
    '【双语输出强制规则】',
    `1. 语言严格匹配 ${lang}：zh=纯中文，en=纯英文，严禁混排。`,
    '2. 英文模式要求：使用学术笔记风格、句式工整、逻辑严谨，不口语化；标题、段落、列表全部英文标准化书写。',
    '3. 无论中英文，知识点覆盖率、结构完整性、层级规则完全一致。',
    '',
    '【输出格式硬性锁定】',
    '只输出标准 JSON，不要 markdown、不要解释、不要前言结语。',
    '固定结构：',
    '{"sections":[{"type":"heading","level":2,"text":"一、模块名"},{"type":"paragraph","text":"...","cardId":"可选","citationIndex":1},{"type":"bullet_list","items":["…"]},{"type":"ordered_list","items":["…"]}]}',
    '英文模式自动将标题改为标准英文章节标题（Chapter 1 / Chapter 2），段落与列表全部英文输出，结构字段不变。',
    '',
    '【结构与文笔规则】',
    '1. 开篇用完整段落说明主题、价值、本篇覆盖核心模块。',
    '2. 正文一级模块统一使用 level=2 大标题；子模块可用 level=3 子标题。',
    '   - 中文：「一、模块名」「（一）子模块名」',
    '   - 英文：「Chapter 1: XXX」「1.1 XXX」',
    '3. 每个大标题下：段落讲清「是什么/为什么/如何用」；列表列出「有哪些/分几步/对比项」；列表项本身用完整短句，不要只有关键词。',
    '4. 行文逻辑：背景问题 → 核心概念 → 方法路径 → 关键细节 → 边界注意 → 总结收束。',
    '5. 禁止提纲式过简，禁止过度压缩；卡片素材偏短时，必须基于卡片事实做合理展开（补充因果、适用边界、操作含义、与上下文衔接），但仍禁止编造卡片未出现的新知识点、数据或出处。',
    '6. 段落承上启下，模块衔接自然；该成文处成文，该分点处分点。',
    '',
    '【引用与事实规则】',
    '7. 严格基于卡片素材：可展开阐释，不可捏造新事实。',
    '8. 使用卡片内容时携带 cardId；answerMode=rag 时正确携带 citationIndex。',
    '9. 禁止输出 materialId，禁止手动书写引用标记。',
    '合并多处同源论据时，可以在同一段落/列表项内写多个 cardId，例如 cardId:"card1,card3"。',
    '',
    '【重绘规则】',
    '10. 若 regenerate=true 且存在 previousNote：完全重构组织结构与表述，避免高度重复，同时依然100%覆盖所有卡片独有要点。',
    '',
    '【章节适配规则】',
    hasChapters
      ? '- 存在 chapters：各二级标题严格对应章节，每章完整覆盖该章所有卡片独有要点，不空章、不丢卡；重复知识点在章节内合并；章内该分点处必须用列表。'
      : '- 无 chapters：自主设计合理章节结构，合并重复内容，保证所有卡片独有要点全部落地；叙述用段落，并列用列表。',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

function countCardsInPayload(payload) {
  if (Array.isArray(payload?.chapters) && payload.chapters.length) {
    return payload.chapters.reduce((sum, chapter) => sum + ((chapter.cards || []).length), 0);
  }
  return Array.isArray(payload?.cards) ? payload.cards.length : 0;
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
