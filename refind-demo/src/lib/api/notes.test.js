import { describe, expect, it } from 'vitest';
import {
  buildNoteMaterialRows,
  mapInspirationCard,
  mapNote,
  normalizeNoteContent,
} from './notes.js';

describe('note API mappers', () => {
  it('normalizes note content for API', () => {
    expect(normalizeNoteContent({ text: 'hi' })).toEqual({
      text: 'hi',
      blocks: [],
      sections: [],
    });
  });

  it('maps database note relations to the workspace shape', () => {
    expect(mapNote({
      id: 'note-1',
      notebook_id: 'notebook-1',
      title: null,
      content: { text: 'Draft' },
      created_at: '2026-09-13T00:00:00Z',
      updated_at: '2026-09-13T01:00:00Z',
      note_inspiration_cards: [
        { inspiration_card_id: 'card-2', sort_order: 1, user_thought: 'second' },
        { inspiration_card_id: 'card-1', sort_order: 0, user_thought: 'first' },
      ],
    })).toMatchObject({
      id: 'note-1',
      notebookId: 'notebook-1',
      title: '未命名笔记',
      content: { text: 'Draft', blocks: [], sections: [] },
      inspirationCardIds: ['card-1', 'card-2'],
      materialThoughts: { 'card-1': 'first', 'card-2': 'second' },
    });
  });

  it('maps database cards to existing card snapshots', () => {
    expect(mapInspirationCard({
      id: 'card-1',
      content_snapshot: 'A useful answer',
      source_question_snapshot: 'What next?',
      answer_mode: 'rag',
      citation_snapshot: [{ label: '资料 1' }],
      source_knowledge_base_ids: ['base-1'],
      created_at: '2026-09-13T00:00:00Z',
    })).toMatchObject({
      id: 'card-1',
      contentSnapshot: 'A useful answer',
      questionSnapshot: 'What next?',
      answerMode: 'rag',
      citation: { label: '资料 1' },
      sourceKnowledgeBaseIds: ['base-1'],
    });
  });

  it('builds ordered, de-duplicated relation rows for the replace RPC', () => {
    expect(buildNoteMaterialRows(
      ['card-2', 'card-1', 'card-2'],
      { 'card-1': 'first thought', 'card-2': '' },
    )).toEqual([
      { inspiration_card_id: 'card-2', sort_order: 0, user_thought: null },
      { inspiration_card_id: 'card-1', sort_order: 1, user_thought: 'first thought' },
    ]);
  });
});
