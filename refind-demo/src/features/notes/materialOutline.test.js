import { describe, expect, it } from 'vitest';
import {
  addCardsToUnassigned,
  flattenOutlineCardIds,
  hasSavedOutline,
  moveCardInOutline,
  normalizeOutline,
  noteHasGeneratedBody,
  reconcileOutline,
  removeCardFromOutline,
  renameChapter,
} from './materialOutline.js';

describe('materialOutline', () => {
  it('normalizeOutline returns null for empty/missing', () => {
    expect(normalizeOutline(null)).toBeNull();
    expect(normalizeOutline({ version: 1, chapters: [] })).toBeNull();
  });

  it('reconcile drops unknown ids and parks missing bound ids in unassigned', () => {
    const outline = {
      version: 1,
      chapters: [{ id: 'ch1', title: '开场', cardIds: ['a', 'gone'] }],
      unassignedCardIds: ['x'],
    };
    const next = reconcileOutline(outline, ['a', 'b']);
    expect(next.chapters[0].cardIds).toEqual(['a']);
    expect(next.unassignedCardIds).toEqual(['b']);
  });

  it('flattenOutlineCardIds skips empty chapters then appends unassigned', () => {
    const ids = flattenOutlineCardIds({
      version: 1,
      chapters: [
        { id: 'c1', title: 'A', cardIds: ['a'] },
        { id: 'c2', title: 'Empty', cardIds: [] },
        { id: 'c3', title: 'B', cardIds: ['b'] },
      ],
      unassignedCardIds: ['u'],
    });
    expect(ids).toEqual(['a', 'b', 'u']);
  });

  it('move / rename / add / remove helpers keep version 1', () => {
    let o = {
      version: 1,
      chapters: [
        { id: 'c1', title: 'A', cardIds: ['a'] },
        { id: 'c2', title: 'B', cardIds: ['b'] },
      ],
      unassignedCardIds: [],
    };
    o = moveCardInOutline(o, 'a', { toChapterId: 'c2', index: 0 });
    expect(o.chapters[0].cardIds).toEqual([]);
    expect(o.chapters[1].cardIds).toEqual(['a', 'b']);
    o = renameChapter(o, 'c1', '新开场');
    expect(o.chapters[0].title).toBe('新开场');
    o = addCardsToUnassigned(o, ['n']);
    expect(o.unassignedCardIds).toEqual(['n']);
    o = removeCardFromOutline(o, 'b');
    expect(o.chapters[1].cardIds).toEqual(['a']);
  });

  it('hasSavedOutline / noteHasGeneratedBody', () => {
    expect(hasSavedOutline({ outline: { version: 1, chapters: [{ id: 'c', title: 't', cardIds: ['a'] }], unassignedCardIds: [] } })).toBe(true);
    expect(noteHasGeneratedBody({ sections: [{ type: 'paragraph', text: 'hi' }] })).toBe(true);
    expect(noteHasGeneratedBody({ sections: [], text: '' })).toBe(false);
  });
});
