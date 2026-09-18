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
  CONVERSATION_HISTORY_RETENTION_DAYS,
  groupConversationsByDay,
  groupLabelForDate,
  isPlaceholderTitle,
  NEW_CONVERSATION_TITLE,
  pairChatTurns,
  resolveAfterConversationDelete,
  truncateConversationFromTurn,
} from './conversations.js';

describe('groupLabelForDate', () => {
  it('labels today, yesterday, and older days as YYYY年M月D日', () => {
    const now = new Date('2026-09-17T12:00:00');
    expect(groupLabelForDate(now, now)).toBe('今天');
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    expect(groupLabelForDate(yesterday, now)).toBe('昨天');
    expect(groupLabelForDate(new Date('2026-03-15T08:00:00'), now)).toBe('2026年3月15日');
    expect(groupLabelForDate(new Date('2025-12-01T08:00:00'), now)).toBe('2025年12月1日');
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
  it('groups by today/yesterday/YYYY年M月D日 and drops outside retention', () => {
    const now = new Date('2026-09-17T12:00:00');
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const older = new Date('2026-08-01T10:00:00');
    const expired = new Date(now);
    expired.setDate(now.getDate() - (CONVERSATION_HISTORY_RETENTION_DAYS + 5));

    const groups = groupConversationsByDay([
      { id: '1', title: 'A', updatedAt: now.toISOString() },
      { id: '2', title: 'B', updatedAt: older.toISOString() },
      { id: '3', title: 'C', updatedAt: yesterday.toISOString() },
      { id: '4', title: 'D', updatedAt: expired.toISOString() },
    ], now);

    expect(groups.map((group) => group.label)).toEqual([
      '今天',
      '昨天',
      '2026年8月1日',
    ]);
    expect(groups[0].items).toHaveLength(1);
    expect(groups.find((group) => group.label === '2026年8月1日')?.items[0].id).toBe('2');
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
      webSources: [],
    });
  });

  it('pairs web_sources from assistant messages', () => {
    const turns = pairChatTurns([
      { id: 'u1', role: 'user', content: '天气' },
      {
        id: 'a1',
        role: 'assistant',
        content: '晴',
        answer_mode: 'general',
        web_sources: [{ order: 1, title: '气象台', url: 'https://example.com' }],
      },
    ], {});

    expect(turns[0].webSources).toEqual([
      { order: 1, title: '气象台', url: 'https://example.com' },
    ]);
  });

  it('restores #tags on loaded user turns for bubble display', () => {
    const turns = pairChatTurns([
      { id: 'u1', role: 'user', content: '#AI办公助手 是怎么做的', answer_mode: 'rag' },
      { id: 'a1', role: 'assistant', content: '暂无相关资料', answer_mode: 'rag', is_insufficient: true },
    ], {});
    expect(turns[0].question).toBe('#AI办公助手 是怎么做的');
    expect(turns[0].selectedTags).toEqual(['AI办公助手']);
  });
});

describe('truncateConversationFromTurn', () => {
  beforeEach(() => {
    from.mockReset();
  });

  it('deletes the edited turn and every later message', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 'u1', role: 'user', created_at: '2026-09-16T01:00:00Z' },
        { id: 'a1', role: 'assistant', created_at: '2026-09-16T01:00:01Z' },
        { id: 'u2', role: 'user', created_at: '2026-09-16T01:01:00Z' },
        { id: 'a2', role: 'assistant', created_at: '2026-09-16T01:01:01Z' },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
    const delIn = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn(() => ({ in: delIn }));
    from.mockImplementation((table) => {
      if (table === 'chat_messages') return { select, delete: del };
      return {};
    });

    await truncateConversationFromTurn('conv-1', 'a1');

    expect(delIn).toHaveBeenCalledWith('id', ['u1', 'a1', 'u2', 'a2']);
  });

  it('no-ops when the turn is not persisted yet', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ order })) }));
    const del = vi.fn();
    from.mockReturnValue({ select, delete: del });

    await truncateConversationFromTurn('conv-1', 'pending-1');

    expect(del).not.toHaveBeenCalled();
  });
});

describe('resolveAfterConversationDelete', () => {
  const list = [
    { id: 'newest', title: 'A' },
    { id: 'older', title: 'B' },
  ];

  it('focuses the latest remaining conversation when the active one is deleted', () => {
    expect(resolveAfterConversationDelete(list, 'newest', 'newest')).toEqual({
      remaining: [{ id: 'older', title: 'B' }],
      nextActiveId: 'older',
      focusNext: true,
    });
  });

  it('clears focus when the last conversation is deleted', () => {
    expect(resolveAfterConversationDelete([{ id: 'only' }], 'only', 'only')).toEqual({
      remaining: [],
      nextActiveId: null,
      focusNext: true,
    });
  });

  it('keeps the current conversation when a different one is deleted', () => {
    expect(resolveAfterConversationDelete(list, 'older', 'newest')).toEqual({
      remaining: [{ id: 'newest', title: 'A' }],
      nextActiveId: 'newest',
      focusNext: false,
    });
  });
});
