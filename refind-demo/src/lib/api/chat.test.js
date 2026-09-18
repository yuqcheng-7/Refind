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
      userMessageId: undefined,
      conversationId: 'conv-1',
      question: 'Q',
      answer: '答案[1]',
      mode: 'rag',
      online: false,
      selectedBases: ['产品'],
      selectedTags: [],
      knowledgeBaseIds: [],
      insufficient: false,
      citations: [{ order: 1, label: '增长笔记', materialId: 'mat1', excerpt: '...' }],
      webSources: [],
    });
  });

  it('maps webSources from online answers', () => {
    expect(mapChatResponseToMessage({
      question: '天气',
      response: {
        assistantMessageId: 'a1',
        userMessageId: 'u1',
        conversationId: 'c1',
        content: '晴',
        answerMode: 'general',
        webSources: [{ order: 1, title: '气象台', url: 'https://example.com' }],
      },
    }).webSources).toEqual([{ order: 1, title: '气象台', url: 'https://example.com' }]);
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

  it('keeps a display question with #tags even when API content is stripped', async () => {
    invoke.mockResolvedValue({
      data: {
        conversationId: 'conv-3',
        assistantMessageId: 'assistant-2',
        answerMode: 'rag',
        content: '回答',
        insufficient: false,
        citations: [],
      },
      error: null,
    });

    const message = await sendChatMessage({
      content: '#AI办公助手 是怎么做的',
      question: '#AI办公助手 是怎么做的',
      retrievalContent: 'AI办公助手\n是怎么做的',
      selectedTags: ['AI办公助手'],
      surface: 'home',
    });

    expect(invoke).toHaveBeenCalledWith('chat-message', {
      body: expect.objectContaining({
        content: '#AI办公助手 是怎么做的',
        retrievalContent: 'AI办公助手\n是怎么做的',
      }),
    });
    expect(message.question).toBe('#AI办公助手 是怎么做的');
    expect(message.selectedTags).toEqual(['AI办公助手']);
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
