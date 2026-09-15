import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, getUser } = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from,
    auth: { getUser },
  },
}));

import {
  createConversation,
  groupConversationsByDay,
  groupLabelForDate,
  isPlaceholderTitle,
  NEW_CONVERSATION_TITLE,
  pairChatTurns,
} from './conversations.js';

describe('groupLabelForDate', () => {
  it('labels today and yesterday', () => {
    expect(groupLabelForDate(new Date())).toBe('今天');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(groupLabelForDate(yesterday)).toBe('昨天');
  });
});

describe('isPlaceholderTitle', () => {
  it('treats blank and default new-chat titles as placeholders', () => {
    expect(isPlaceholderTitle('')).toBe(true);
    expect(isPlaceholderTitle('  ')).toBe(true);
    expect(isPlaceholderTitle(NEW_CONVERSATION_TITLE)).toBe(true);
    expect(isPlaceholderTitle('未命名会话')).toBe(true);
    expect(isPlaceholderTitle('ima怎么用')).toBe(false);
  });
});

describe('createConversation', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('inserts a home draft conversation', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'c1',
        title: NEW_CONVERSATION_TITLE,
        updated_at: '2026-09-15T00:00:00Z',
        created_at: '2026-09-15T00:00:00Z',
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    from.mockReturnValue({ insert });

    const created = await createConversation({ surface: 'home' });

    expect(from).toHaveBeenCalledWith('chat_conversations');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: NEW_CONVERSATION_TITLE,
      surface: 'home',
    });
    expect(created).toEqual({
      id: 'c1',
      title: NEW_CONVERSATION_TITLE,
      updatedAt: '2026-09-15T00:00:00Z',
      createdAt: '2026-09-15T00:00:00Z',
    });
  });

  it('requires knowledgeBaseId for knowledge surface', async () => {
    await expect(createConversation({ surface: 'knowledge' })).rejects.toThrow(/knowledgeBaseId/);
  });

  it('inserts a knowledge draft bound to one knowledge base', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'c2',
        title: NEW_CONVERSATION_TITLE,
        updated_at: '2026-09-15T00:00:00Z',
        created_at: '2026-09-15T00:00:00Z',
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    from.mockReturnValue({ insert });

    await createConversation({ surface: 'knowledge', knowledgeBaseId: 'kb-1' });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      title: NEW_CONVERSATION_TITLE,
      surface: 'knowledge',
      knowledge_base_id: 'kb-1',
    });
  });
});

describe('groupConversationsByDay', () => {
  it('groups conversations into ordered buckets', () => {
    const today = new Date().toISOString();
    const older = new Date('2020-01-01').toISOString();
    const groups = groupConversationsByDay([
      { id: '1', title: 'A', updatedAt: today },
      { id: '2', title: 'B', updatedAt: older },
    ]);
    expect(groups.map((group) => group.label)).toEqual(['今天', '更早']);
    expect(groups[0].items).toHaveLength(1);
  });
});

describe('pairChatTurns', () => {
  it('pairs user and assistant rows with citations', () => {
    const turns = pairChatTurns([
      { id: 'u1', role: 'user', content: '问题一', answer_mode: 'rag' },
      { id: 'a1', role: 'assistant', content: '回答一[1]', answer_mode: 'rag', is_insufficient: false },
      { id: 'u2', role: 'user', content: '问题二', answer_mode: 'rag' },
      { id: 'a2', role: 'assistant', content: '回答二', answer_mode: 'rag', is_insufficient: false },
    ], {
      a1: [{
        citation_order: 1,
        material_id: 'mat-1',
        material_title_snapshot: '资料A',
        excerpt: '摘录',
      }],
    });

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      id: 'a1',
      question: '问题一',
      answer: '回答一[1]',
      citations: [{ order: 1, label: '资料A', materialId: 'mat-1', excerpt: '摘录' }],
    });
  });
});
