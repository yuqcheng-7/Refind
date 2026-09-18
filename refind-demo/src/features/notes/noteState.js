import {
  addCardsToUnassigned,
  flattenOutlineCardIds,
  normalizeOutline,
} from './materialOutline.js';

export function createBlankNote(now = Date.now()) {
  return {
    id: `note-${now}`,
    title: '未命名笔记',
    content: { text: '', blocks: [] },
    notebookId: null,
    updatedLabel: '刚刚创建',
    inspirationCardIds: [],
    syncedBaseIds: [],
  };
}

export function filterNotes(notes, query, notebookId) {
  const needle = query.trim().toLowerCase();

  return notes.filter((note) => (
    (notebookId === 'all' || note.notebookId === notebookId)
    && (!needle || `${note.title} ${note.content.text}`.toLowerCase().includes(needle))
  ));
}

export function attachCards(note, cardIds) {
  const added = cardIds.filter((id) => !note.inspirationCardIds.includes(id));
  const inspirationCardIds = [...note.inspirationCardIds, ...added];
  const outline = normalizeOutline(note.content?.outline);
  if (!outline || !added.length) {
    return { ...note, inspirationCardIds };
  }
  return {
    ...note,
    inspirationCardIds,
    content: {
      ...note.content,
      outline: addCardsToUnassigned(outline, added),
    },
  };
}

export function generateNoteDocument(note, cards) {
  const outline = normalizeOutline(note.content?.outline);
  const outlineCardIds = outline ? flattenOutlineCardIds(outline) : [];
  const selectedIds = outline
    ? [
      ...outlineCardIds,
      ...note.inspirationCardIds.filter((id) => !outlineCardIds.includes(id)),
    ]
    : note.inspirationCardIds;
  const selected = selectedIds
    .map((id) => cards.find((card) => card.id === id))
    .filter(Boolean);

  if (!selected.length) {
    return {
      text: '',
      blocks: [],
      sections: [],
      ...(outline ? { outline } : {}),
    };
  }

  const title = note.title && note.title !== '未命名笔记' ? note.title : '灵感整理草稿';
  const citedPoints = selected.map((card, index) => {
    const question = card.questionSnapshot ? `围绕「${card.questionSnapshot}」` : '基于这张卡片';
    const citationLabel = card.citation?.label
      || card.sourceLabel
      || (card.answerMode === 'rag' ? '知识库回答' : '通用回答');
    return {
      cardId: card.id,
      text: `${index + 1}. ${question}，可提炼为：${card.contentSnapshot}。`,
      citationIndex: index + 1,
      citationLabel,
    };
  });

  const sections = [
    { type: 'paragraph', text: `关于「${title}」，可以把这 ${selected.length} 张灵感卡片收成一条主线：` },
    { type: 'paragraph', text: '先抓住共同问题：用户要更快看到价值，并形成可持续的复盘与行动节奏。' },
    { type: 'paragraph', text: '可落地的要点：' },
    ...citedPoints.map((point) => ({
      type: 'paragraph',
      text: point.text,
      cardId: point.cardId,
      citationIndex: point.citationIndex,
      citationLabel: point.citationLabel,
    })),
    { type: 'paragraph', text: '建议写法：先用一段话点出问题，再按卡片顺序展开论据，最后落到一个可执行的下一步。' },
  ];

  return {
    text: sections.map((section) => section.text).join('\n\n'),
    blocks: citedPoints.map((point) => ({
      text: point.text,
      cardId: point.cardId,
      citationLabel: point.citationLabel,
      citationIndex: point.citationIndex,
    })),
    sections,
    ...(outline ? { outline } : {}),
  };
}

export function syncNoteToBases(note, baseIds) {
  return { synced: baseIds, failed: [] };
}
