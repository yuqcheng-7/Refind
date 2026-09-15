import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('../supabaseClient.js', () => ({
  supabase: { functions: { invoke } },
}));

import { mapChatResponseToMessage, sendChatMessage } from './chat.js';

describe('mapChatResponseToMessage', () => {
  it('maps rag citations to UI labels', () => {
    const message = mapChatResponseToMessage({
      question: 'Q',
      selectedBases: ['产品'],
      selectedTags: [],
      online: false,
      response: {
        conversationId: 'conv-1',
        assistantMessageId: 'm1',
        answerMode: 'rag',
        content: '答案[1]',
        insufficient: false,
        citations: [{ order: 1, title: '增长笔记', materialId: 'mat1', excerpt: '...' }],
      },
    });

    expect(message).toEqual({
      id: 'm1',
      conversationId: 'conv-1',
      question: 'Q',
      answer: '答案[1]',
      mode: 'rag',
      online: false,
      selectedBases: ['产品'],
      selectedTags: [],
      insufficient: false,
      citations: [{ order: 1, label: '增长笔记', materialId: 'mat1', excerpt: '...' }],
    });
  });
});

describe('sendChatMessage', () => {
  beforeEach(() => invoke.mockReset());

  it('invokes chat-message with API fields and returns a mapped UI message', async () => {
    invoke.mockResolvedValue({
      data: {
        conversationId: 'conv-2',
        assistantMessageId: 'assistant-1',
        answerMode: 'general',
        content: '真实回答',
        insufficient: false,
        citations: [],
      },
      error: null,
    });

    const message = await sendChatMessage({
      content: '问题',
      thinkingMode: 'deep',
      onlineEnabled: true,
      knowledgeBaseIds: [],
      tagFilters: [],
      surface: 'home',
      conversationId: 'conv-2',
      selectedBases: [],
      selectedTags: [],
    });

    expect(invoke).toHaveBeenCalledWith('chat-message', {
      body: {
        content: '问题',
        thinkingMode: 'deep',
        onlineEnabled: true,
        knowledgeBaseIds: [],
        tagFilters: [],
        surface: 'home',
        conversationId: 'conv-2',
      },
    });
    expect(message).toMatchObject({
      id: 'assistant-1',
      question: '问题',
      answer: '真实回答',
      mode: 'general',
    });
  });

  it('throws the function error instead of creating a demo response', async () => {
    const error = new Error('AI unavailable');
    invoke.mockResolvedValue({ data: null, error });

    await expect(sendChatMessage({
      content: '问题',
      surface: 'home',
    })).rejects.toThrow('AI unavailable');
  });

  it('throws when the function body contains an error field', async () => {
    invoke.mockResolvedValue({
      data: { error: 'DASHSCOPE_API_KEY missing' },
      error: null,
    });

    await expect(sendChatMessage({
      content: '问题',
      surface: 'home',
    })).rejects.toThrow('DASHSCOPE_API_KEY missing');
  });
});
