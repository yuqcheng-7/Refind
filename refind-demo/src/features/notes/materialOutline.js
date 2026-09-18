/**
 * @typedef {Object} MaterialOutlineChapter
 * @property {string} id
 * @property {string} title
 * @property {string[]} cardIds
 */

/**
 * @typedef {Object} MaterialOutline
 * @property {1} version
 * @property {MaterialOutlineChapter[]} chapters
 * @property {string[]} unassignedCardIds
 * @property {string} [updatedAt]
 */

/** @returns {MaterialOutline} */
export function emptyOutline() {
  return {
    version: 1,
    chapters: [],
    unassignedCardIds: [],
  };
}

/** @param {unknown[]} values @returns {string[]} */
function uniqueStringIds(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** @param {MaterialOutline} outline @returns {MaterialOutline} */
function removeCardEverywhere(outline, cardId) {
  return {
    version: 1,
    chapters: outline.chapters.map((chapter) => ({
      ...chapter,
      cardIds: chapter.cardIds.filter((id) => id !== cardId),
    })),
    unassignedCardIds: outline.unassignedCardIds.filter((id) => id !== cardId),
    ...(outline.updatedAt ? { updatedAt: outline.updatedAt } : {}),
  };
}

/** @param {unknown} value @returns {MaterialOutline | null} */
export function normalizeOutline(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.chapters)) {
    return null;
  }

  const chapters = value.chapters
    .filter((chapter) => chapter && typeof chapter.id === 'string' && typeof chapter.title === 'string')
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      cardIds: uniqueStringIds(chapter.cardIds),
    }));

  if (chapters.length === 0) {
    return null;
  }

  return {
    version: 1,
    chapters,
    unassignedCardIds: uniqueStringIds(value.unassignedCardIds),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

/** @param {unknown} content @returns {boolean} */
export function hasSavedOutline(content) {
  if (!content || typeof content !== 'object') return false;
  return normalizeOutline(content.outline) !== null;
}

/** @param {unknown} content @returns {boolean} */
export function noteHasGeneratedBody(content) {
  if (!content || typeof content !== 'object') return false;
  if (Array.isArray(content.sections) && content.sections.length > 0) {
    return true;
  }
  if (typeof content.text === 'string' && content.text.trim()) {
    return true;
  }
  if (typeof content.html === 'string' && content.html.trim()) {
    return true;
  }
  return false;
}

/** @param {MaterialOutline} outline @param {string[]} boundCardIds @returns {MaterialOutline} */
export function reconcileOutline(outline, boundCardIds) {
  const bound = uniqueStringIds(boundCardIds);
  const boundSet = new Set(bound);

  const chapters = outline.chapters.map((chapter) => ({
    ...chapter,
    cardIds: chapter.cardIds.filter((id) => boundSet.has(id)),
  }));

  let unassignedCardIds = outline.unassignedCardIds.filter((id) => boundSet.has(id));

  const placed = new Set([
    ...chapters.flatMap((chapter) => chapter.cardIds),
    ...unassignedCardIds,
  ]);

  const missing = bound.filter((id) => !placed.has(id));
  unassignedCardIds = [...unassignedCardIds, ...missing];

  return {
    version: 1,
    chapters,
    unassignedCardIds,
    ...(outline.updatedAt ? { updatedAt: outline.updatedAt } : {}),
  };
}

/** @param {MaterialOutline} outline @returns {string[]} */
export function flattenOutlineCardIds(outline) {
  const ids = [];
  for (const chapter of outline.chapters) {
    if (chapter.cardIds.length === 0) continue;
    ids.push(...chapter.cardIds);
  }
  ids.push(...outline.unassignedCardIds);
  return ids;
}

/** @param {MaterialOutline} outline @param {string} cardId @param {{ toChapterId: string | 'unassigned', index?: number }} target @returns {MaterialOutline} */
export function moveCardInOutline(outline, cardId, { toChapterId, index }) {
  const next = removeCardEverywhere(outline, cardId);

  if (toChapterId === 'unassigned') {
    const unassignedCardIds = [...next.unassignedCardIds];
    const insertAt = Math.max(0, Math.min(index ?? unassignedCardIds.length, unassignedCardIds.length));
    unassignedCardIds.splice(insertAt, 0, cardId);
    return { ...next, unassignedCardIds };
  }

  const chapters = next.chapters.map((chapter) => {
    if (chapter.id !== toChapterId) return chapter;
    const cardIds = [...chapter.cardIds];
    const insertAt = Math.max(0, Math.min(index ?? cardIds.length, cardIds.length));
    cardIds.splice(insertAt, 0, cardId);
    return { ...chapter, cardIds };
  });

  return { ...next, chapters };
}

/** @param {MaterialOutline} outline @param {string} chapterId @param {string} title @returns {MaterialOutline} */
export function renameChapter(outline, chapterId, title) {
  return {
    ...outline,
    chapters: outline.chapters.map((chapter) => (
      chapter.id === chapterId ? { ...chapter, title } : chapter
    )),
  };
}

/** @param {MaterialOutline} outline @param {string} cardId @returns {MaterialOutline} */
export function removeCardFromOutline(outline, cardId) {
  return removeCardEverywhere(outline, cardId);
}

/** @param {MaterialOutline} outline @param {string[]} cardIds @returns {MaterialOutline} */
export function addCardsToUnassigned(outline, cardIds) {
  const existing = new Set([
    ...outline.unassignedCardIds,
    ...outline.chapters.flatMap((chapter) => chapter.cardIds),
  ]);
  const toAdd = uniqueStringIds(cardIds).filter((id) => !existing.has(id));
  return {
    ...outline,
    unassignedCardIds: [...outline.unassignedCardIds, ...toAdd],
  };
}
