import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke },
  },
}));

import {
  buildNoteMaterialRows,
  cardMatchesOriginFilter,
  cardMatchesTimeFilter,
  citationsReferencedByText,
  formatCardPreviewText,
  generateNote,
  outlineNoteMaterials,
  mapInspirationCard,
  mapNote,
  normalizeNoteContent,
  prependInspirationCard,
  resolveCardCitedMaterials,
  resolveCardMaterialLabels,
  resolveCardOriginLabel,
  resolveCitationSnapshotForInsert,
  syncNote,
} from './notes.js';

describe('generateNote', () => {
  beforeEach(() => invoke.mockReset());

  it('invokes generate-note Edge Function with noteId', async () => {
    invoke.mockResolvedValue({
      data: {
        id: 'note-1',
        notebook_id: null,
        title: '增长笔记',
        content: {
          text: '正文',
          blocks: [],
          sections: [{ type: 'paragraph', text: '正文', cardId: 'rag-1', citationIndex: 1, citationLabel: '资料' }],
        },
        created_at: '2026-09-18T00:00:00Z',
        updated_at: '2026-09-18T01:00:00Z',
        note_inspiration_cards: [
          { inspiration_card_id: 'rag-1', sort_order: 0, user_thought: null },
        ],
      },
      error: null,
    });

    const note = await generateNote('note-1');

    expect(invoke).toHaveBeenCalledWith('generate-note', { body: { noteId: 'note-1' } });
    expect(note).toMatchObject({
      id: 'note-1',
      title: '增长笔记',
      inspirationCardIds: ['rag-1'],
      content: {
        text: '正文',
        sections: [{ type: 'paragraph', text: '正文', cardId: 'rag-1' }],
      },
    });
  });
});

describe('outlineNoteMaterials', () => {
  beforeEach(() => invoke.mockReset());

  it('invokes outline-note-materials Edge Function with noteId', async () => {
    invoke.mockResolvedValue({
      data: {
        id: 'note-1',
        notebook_id: null,
        title: '增长笔记',
        content: {
          text: '',
          blocks: [],
          sections: [],
          outline: {
            version: 1,
            chapters: [{ id: 'ch1', title: '开场', cardIds: ['rag-1'] }],
            unassignedCardIds: ['rag-2'],
          },
        },
        created_at: '2026-09-18T00:00:00Z',
        updated_at: '2026-09-18T01:00:00Z',
        note_inspiration_cards: [
          { inspiration_card_id: 'rag-1', sort_order: 0, user_thought: null },
          { inspiration_card_id: 'rag-2', sort_order: 1, user_thought: '补充' },
        ],
      },
      error: null,
    });

    const note = await outlineNoteMaterials('note-1');

    expect(invoke).toHaveBeenCalledWith('outline-note-materials', { body: { noteId: 'note-1' } });
    expect(note).toMatchObject({
      id: 'note-1',
      title: '增长笔记',
      inspirationCardIds: ['rag-1', 'rag-2'],
      content: {
        outline: {
          chapters: [{ id: 'ch1', title: '开场', cardIds: ['rag-1'] }],
          unassignedCardIds: ['rag-2'],
        },
      },
    });
  });
});

describe('syncNote', () => {
  beforeEach(() => invoke.mockReset());

  it('invokes sync-note Edge Function with noteId and knowledgeBaseIds', async () => {
    invoke.mockResolvedValue({
      data: {
        noteId: 'note-1',
        synced: [
          { knowledgeBaseId: 'kb-a', materialId: 'm1' },
          { knowledgeBaseId: 'kb-b', materialId: 'm2' },
        ],
        failed: [],
        knowledgeBaseIds: ['kb-a', 'kb-b'],
      },
      error: null,
    });

    const result = await syncNote({ noteId: 'note-1', knowledgeBaseIds: ['kb-a', 'kb-b'] });

    expect(invoke).toHaveBeenCalledWith('sync-note', {
      body: { noteId: 'note-1', knowledgeBaseIds: ['kb-a', 'kb-b'] },
    });
    expect(result).toEqual({
      noteId: 'note-1',
      synced: [
        { knowledgeBaseId: 'kb-a', materialId: 'm1' },
        { knowledgeBaseId: 'kb-b', materialId: 'm2' },
      ],
      failed: [],
      knowledgeBaseIds: ['kb-a', 'kb-b'],
    });
  });

  it('rejects empty knowledgeBaseIds before invoking', async () => {
    await expect(syncNote({ noteId: 'note-1', knowledgeBaseIds: [] })).rejects.toThrow(/knowledgeBaseIds/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('note API mappers', () => {
  it('normalizes note content for API', () => {
    expect(normalizeNoteContent({ text: 'hi' })).toEqual({
      text: 'hi',
      blocks: [],
      sections: [],
    });
  });

  it('normalizeNoteContent preserves valid outline and drops invalid', () => {
    const withOutline = normalizeNoteContent({
      text: '',
      sections: [],
      outline: {
        version: 1,
        chapters: [{ id: 'ch1', title: '开场', cardIds: ['a'] }],
        unassignedCardIds: [],
      },
    });
    expect(withOutline.outline.chapters[0].title).toBe('开场');

    const bad = normalizeNoteContent({ text: '', outline: { version: 2, chapters: [] } });
    expect(bad.outline).toBeUndefined();
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
      note_knowledge_base_materials: [
        { knowledge_base_id: 'kb-a', material_id: 'm1' },
        { knowledge_base_id: 'kb-b', material_id: 'm2' },
      ],
    })).toMatchObject({
      id: 'note-1',
      notebookId: 'notebook-1',
      title: '未命名笔记',
      content: { text: 'Draft', blocks: [], sections: [] },
      inspirationCardIds: ['card-1', 'card-2'],
      materialThoughts: { 'card-1': 'first', 'card-2': 'second' },
      syncedBaseIds: ['kb-a', 'kb-b'],
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
      sourceLabel: '知识库回答',
    });
  });

  it('resolves card origin and material labels for the detail dialog', () => {
    const card = {
      answerMode: 'rag',
      sourceKnowledgeBaseIds: ['base-growth'],
      citationSnapshot: [
        { label: '资料甲' },
        { label: '资料乙' },
      ],
    };
    expect(resolveCardOriginLabel(card, [{ id: 'base-growth', name: '增长知识库' }])).toBe('增长知识库');
    expect(resolveCardMaterialLabels(card)).toEqual(['资料甲', '资料乙']);
    expect(resolveCardOriginLabel({ answerMode: 'general' })).toBe('通用回答');
  });

  it('formats card cover text without markdown ornaments', () => {
    expect(formatCardPreviewText('1. **自动化新闻推送**：用工具汇总资讯[1]。')).toBe(
      '1. 自动化新闻推送：用工具汇总资讯。',
    );
  });

  it('lists only materials cited in the card text', () => {
    const card = {
      contentSnapshot: '先看[1]，再看[3]。',
      citationSnapshot: [
        { order: 1, label: '甲', materialId: 'a' },
        { order: 2, label: '乙', materialId: 'b' },
        { order: 3, label: '丙', materialId: 'c' },
      ],
    };
    expect(resolveCardCitedMaterials(card).map((item) => item.label)).toEqual(['甲', '丙']);
    expect(citationsReferencedByText(card.contentSnapshot, card.citationSnapshot).map((item) => item.label))
      .toEqual(['甲', '丙']);
  });

  it('filters inspiration cards by saved time and origin', () => {
    const now = new Date('2026-09-18T12:00:00');
    const todayCard = { createdAt: '2026-09-18T03:00:00', answerMode: 'general' };
    const weekCard = { createdAt: '2026-09-14T03:00:00', answerMode: 'rag', sourceKnowledgeBaseIds: ['base-1'] };
    const oldCard = { createdAt: '2026-08-01T03:00:00', answerMode: 'rag', sourceKnowledgeBaseIds: ['base-2'] };

    expect(cardMatchesTimeFilter(todayCard, 'today', now)).toBe(true);
    expect(cardMatchesTimeFilter(weekCard, 'today', now)).toBe(false);
    expect(cardMatchesTimeFilter(weekCard, '7d', now)).toBe(true);
    expect(cardMatchesTimeFilter(oldCard, '30d', now)).toBe(false);

    expect(cardMatchesOriginFilter(todayCard, 'general')).toBe(true);
    expect(cardMatchesOriginFilter(weekCard, 'general')).toBe(false);
    expect(cardMatchesOriginFilter(weekCard, 'base-1')).toBe(true);
    expect(cardMatchesOriginFilter(weekCard, 'base-2')).toBe(false);
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

  it('never inserts fake material citations for general-mode cards', () => {
    expect(resolveCitationSnapshotForInsert({
      answerMode: 'general',
      citation: { label: '伪造资料', materialId: 'fake-mat-1' },
      citationSnapshot: [{ label: '伪造资料', materialId: 'fake-mat-1' }],
    })).toBeNull();
  });

  it('keeps RAG citation snapshots for insert', () => {
    const snapshot = [
      { order: 1, label: '资料甲', materialId: 'mat-1', excerpt: '摘录' },
    ];
    expect(resolveCitationSnapshotForInsert({
      answerMode: 'rag',
      citationSnapshot: snapshot,
    })).toEqual(snapshot);
  });

  it('prepends a saved card for immediate inspiration-list refresh', () => {
    const existing = [{ id: 'old' }];
    const saved = { id: 'new', answerMode: 'rag' };
    expect(prependInspirationCard(existing, saved)).toEqual([saved, existing[0]]);
  });
});
