import { describe, expect, it } from 'vitest';
import {
  attachCards,
  createBlankNote,
  filterNotes,
  generateNoteDocument,
  removeCardFromNote,
  syncNoteToBases,
} from './noteState.js';

describe('note state', () => {
  it('creates an immediately selectable unnamed note', () => {
    expect(createBlankNote(1700000000000)).toMatchObject({
      id: 'note-1700000000000', title: '未命名笔记', notebookId: null, inspirationCardIds: [],
    });
  });

  it('finds a note through its title or body text', () => {
    const notes = [{ id: 'n1', title: '会员活动设计', content: { text: '先降低首次行动门槛' }, notebookId: null }];
    expect(filterNotes(notes, '首次', 'all')).toHaveLength(1);
    expect(filterNotes(notes, '会员', 'all')).toHaveLength(1);
  });

  it('appends newly selected cards after existing material', () => {
    expect(attachCards({ inspirationCardIds: ['c1'] }, ['c2', 'c3']).inspirationCardIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('parks new cards in outline unassigned when outline exists', () => {
    const note = {
      inspirationCardIds: ['a'],
      content: {
        text: '',
        outline: {
          version: 1,
          chapters: [{ id: 'ch1', title: '开场', cardIds: ['a'] }],
          unassignedCardIds: [],
        },
      },
    };
    const next = attachCards(note, ['b', 'c']);
    expect(next.inspirationCardIds).toEqual(['a', 'b', 'c']);
    expect(next.content.outline.unassignedCardIds).toEqual(['b', 'c']);
  });

  it('removes a deleted card from note membership, thoughts, and outline', () => {
    const next = removeCardFromNote({
      id: 'n1',
      inspirationCardIds: ['a', 'b'],
      materialThoughts: { a: 'keep', b: 'drop' },
      content: {
        text: '',
        outline: {
          version: 1,
          chapters: [{ id: 'ch1', title: '开场', cardIds: ['a', 'b'] }],
          unassignedCardIds: [],
        },
      },
    }, 'b');

    expect(next.inspirationCardIds).toEqual(['a']);
    expect(next.materialThoughts).toEqual({ a: 'keep' });
    expect(next.content.outline.chapters[0].cardIds).toEqual(['a']);
  });

  it('creates citation nodes only for RAG cards', () => {
    const doc = generateNoteDocument({ title: '增长笔记', inspirationCardIds: ['rag', 'general'] }, [
      { id: 'rag', contentSnapshot: '缩短首次价值时间', answerMode: 'rag', citation: { label: '小红书增长策略' } },
      { id: 'general', contentSnapshot: '建立可持续的复盘节奏', answerMode: 'general', sourceLabel: '通用回答' },
    ]);
    expect(doc.text).toContain('关于「增长笔记」');
    expect(doc.text).toContain('缩短首次价值时间');
    expect(doc.text).toContain('建立可持续的复盘节奏');
    expect(doc.text).not.toContain('（来源：');
    expect(doc.sections.some((section) => section.citationLabel === '小红书增长策略' && section.cardId === 'rag')).toBe(true);
    expect(doc.sections.some((section) => section.citationLabel === '通用回答' && section.cardId === 'general')).toBe(true);
    expect(doc.blocks.some((block) => block.citationLabel === '小红书增长策略' && block.cardId === 'rag')).toBe(true);
  });

  it('reports phase-one sync targets without simulated failures', () => {
    expect(syncNoteToBases({ id: 'n1' }, ['base-growth', 'base-product'])).toEqual({
      synced: ['base-growth', 'base-product'],
      failed: [],
    });
  });
});
