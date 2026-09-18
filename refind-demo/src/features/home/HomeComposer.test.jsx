import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComposer } from './HomeComposer.jsx';

const { deleteAccount, demoSession, sendChatMessage, supabase, conversationStore } = vi.hoisted(() => {
  const session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    user: { id: 'test-user-1', email: 'demo@refind.test' },
  };
  const store = {
    homeItems: [],
    turnsById: {},
  };
  return {
    deleteAccount: vi.fn(),
    demoSession: session,
    conversationStore: store,
    sendChatMessage: vi.fn(async (payload) => {
      const conversationId = payload.conversationId || `conv-test-${Object.keys(store.turnsById).length + 1}`;
      const askText = payload.retrievalContent || payload.content;
      const message = {
        id: `assistant-${askText}`,
        conversationId,
        question: payload.question || payload.content,
        answer: `API 回答：${askText}${payload.knowledgeBaseIds.length ? '[1]' : ''}`,
        mode: payload.surface === 'knowledge' || payload.knowledgeBaseIds.length ? 'rag' : 'general',
        online: payload.onlineEnabled,
        selectedBases: payload.selectedBases,
        selectedTags: payload.selectedTags,
        citations: payload.knowledgeBaseIds.length
          ? [{ order: 1, label: '真实资料标题', materialId: 'material-1', excerpt: '真实摘录' }]
          : [],
      };
      store.turnsById[conversationId] = [...(store.turnsById[conversationId] || []), message];
      if (payload.surface !== 'knowledge') {
        store.homeItems = [{
          id: conversationId,
          title: `会话 · ${String(payload.question || payload.content || '未命名').slice(0, 24)}`,
          updatedAt: new Date().toISOString(),
        }, ...store.homeItems.filter((item) => item.id !== conversationId)];
      }
      return message;
    }),
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

vi.mock('../../lib/supabaseClient.js', () => ({ supabase }));
vi.mock('../../lib/api/chat.js', () => ({ sendChatMessage }));

vi.mock('../../lib/api/auth.js', () => ({
  getSession: () => ({
    then: (resolve) => {
      resolve({ data: { session: demoSession }, error: null });
      return { catch() {} };
    },
  }),
  signOut: async () => ({ error: null }),
  deleteAccount,
}));

vi.mock('../../lib/api/profiles.js', () => ({
  getMyProfile: async () => ({ id: 'test-user-1', email: 'demo@refind.test', display_name: '林知夏' }),
  resolveDisplayName: (profile, session) => profile?.display_name || session?.user?.user_metadata?.display_name || '林知夏',
  updateMyDisplayName: async (name) => ({ id: 'test-user-1', email: 'demo@refind.test', display_name: name }),
}));

vi.mock('../../lib/api/conversations.js', () => ({
  listConversations: async ({ surface } = {}) => (
    surface === 'knowledge'
      ? [{ id: 'kb-conv-1', title: '会员活动设计', updatedAt: new Date().toISOString() }]
      : [...conversationStore.homeItems]
  ),
  createConversation: async ({ surface, title } = {}) => {
    const created = {
      id: `conv-new-${Date.now()}`,
      title: title || '新会话',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    if (surface !== 'knowledge') {
      conversationStore.homeItems = [created, ...conversationStore.homeItems.filter((item) => item.id !== created.id)];
    }
    return created;
  },
  loadConversationTurns: async (conversationId) => {
    if (conversationId === 'kb-conv-1') {
      return [{
        id: 'kb-turn-1',
        conversationId: 'kb-conv-1',
        question: '会员活动怎么设计',
        answer: '可以先从目标用户和权益分层开始。',
        mode: 'rag',
        online: false,
        selectedBases: ['默认知识库'],
        selectedTags: [],
        citations: [],
      }];
    }
    return conversationId ? [...(conversationStore.turnsById[conversationId] || [])] : [];
  },
  renameConversation: async (id, title) => ({ id, title, updatedAt: new Date().toISOString() }),
  deleteConversation: async () => {},
  resolveAfterConversationDelete: (conversations = [], deletedId, activeId) => {
    const remaining = conversations.filter((item) => item?.id !== deletedId);
    const focusNext = Boolean(activeId) && activeId === deletedId;
    return {
      remaining,
      nextActiveId: focusNext ? (remaining[0]?.id ?? null) : (activeId || null),
      focusNext,
    };
  },
  truncateConversationFromTurn: async () => {},
  deleteChatMessages: async () => {},
  isPlaceholderTitle: (title) => !String(title || '').trim() || title === '新会话' || title === '未命名会话',
  groupConversationsByDay: (items = []) => (items.length ? [{ label: '今天', items }] : []),
  groupLabelForDate: () => '今天',
  pairChatTurns: () => [],
  CONVERSATION_HISTORY_RETENTION_DAYS: 90,
}));

vi.mock('../../lib/api/knowledge.js', () => {
  const demoKnowledgeBases = [
    { id: 'base-default', name: '默认知识库', type: 'default' },
    { id: 'base-growth', name: '增长与运营案例', type: 'custom' },
    { id: 'base-product', name: '产品与设计资料', type: 'custom' },
  ];
  return {
    listKnowledgeBases: async () => demoKnowledgeBases,
    createKnowledgeBase: async ({ name }) => ({ id: `base-${name}`, name, type: 'custom' }),
    filterKnowledgeBaseNames: (names, query = '') => {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return names;
      return names.filter((name) => String(name).toLowerCase().includes(needle));
    },
  };
});

const { listMaterialTags } = vi.hoisted(() => ({
  listMaterialTags: vi.fn(async () => [
    { id: 'tag-growth', name: '增长策略' },
    { id: 'tag-research', name: '用户研究' },
    { id: 'tag-product', name: '产品灵感' },
  ]),
}));

vi.mock('../../lib/api/materials.js', () => ({
  listMaterials: async () => [],
  listMaterialTags,
  createMaterialStub: async () => null,
  deleteMaterial: async () => undefined,
  getMaterialById: async () => null,
  moveMaterial: async () => null,
  replaceMaterialTags: async () => [],
  formatMaterialTitle: (item) => item?.title || '',
  formatMaterialTypeLabel: () => '',
  inferPlatformFromUrl: () => 'other',
}));

import { App } from '../../App.jsx';

const bases = ['默认知识库', '增长与运营案例', '产品与设计资料'];
const demoAvailableTags = [
  { id: 'tag-growth', name: '增长策略' },
  { id: 'tag-research', name: '用户研究' },
  { id: 'tag-product', name: '产品灵感' },
];
const homePlaceholder = '请输入内容进行提问，输入 # 可选择标签';

afterEach(() => {
  cleanup();
  sendChatMessage.mockClear();
  conversationStore.homeItems = [];
  conversationStore.turnsById = {};
  listMaterialTags.mockClear();
  listMaterialTags.mockResolvedValue([
    { id: 'tag-growth', name: '增长策略' },
    { id: 'tag-research', name: '用户研究' },
    { id: 'tag-product', name: '产品灵感' },
  ]);
});

describe('HomeComposer', () => {
  it('defaults to DS fast and offline in general-task mode', () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS快速');
    expect(screen.getByRole('button', { name: '不联网' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
    expect(screen.queryByRole('button', { name: '选择标签' })).not.toBeInTheDocument();
  });

  it('switches DeepSeek thinking mode between fast and deep', async () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    expect(screen.getByRole('dialog', { name: '模型设置' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'DS快速' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'QW' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'DS深度' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS深度');
    expect(screen.getByRole('button', { name: 'DS深度' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to QW when online is enabled and restores DS when disabled', async () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(screen.getByRole('button', { name: 'DS深度' }));
    await userEvent.click(screen.getByRole('button', { name: '不联网' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('QW');
    expect(screen.getByRole('button', { name: '联网' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    expect(screen.getByRole('button', { name: 'DS快速' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'DS深度' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'QW' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '联网' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS深度');
  });

  it('forces offline when a knowledge base is selected', async () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '增长与运营案例' }));

    expect(screen.getByRole('button', { name: '不联网' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '不联网' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '选择知识库' })).toHaveTextContent('增长与运营案例');
  });

  it('forces offline and restores DS modelId after online QW then knowledge-base send', async () => {
    const onSubmit = vi.fn();
    render(<HomeComposer bases={bases} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
    await userEvent.click(screen.getByRole('button', { name: 'DS深度' }));
    await userEvent.click(screen.getByRole('button', { name: '不联网' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('QW');

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS深度');
    expect(screen.getByRole('button', { name: '不联网' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '基于资料回答');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'ds-deep',
      thinkingMode: 'deep',
      online: false,
    }));
    expect(onSubmit.mock.calls[0][0].modelId).toMatch(/^ds-(fast|deep)$/);
    expect(onSubmit.mock.calls[0][0].modelId).not.toBe('qwen');
  });

  it('shows multi-base label and opens hash tag suggestions from availableTags', async () => {
    render(<HomeComposer bases={bases} availableTags={[{ id: '1', name: '增长策略' }]} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '产品与设计资料' }));
    fireEvent.pointerDown(document.body);

    expect(screen.getByRole('button', { name: '选择知识库' })).toHaveTextContent('2 个知识库');

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#增');
    expect(screen.getByRole('listbox', { name: '选择标签' })).toBeVisible();
    await userEvent.click(screen.getByRole('option', { name: '#增长策略' }));
    expect(screen.getByPlaceholderText(homePlaceholder)).toHaveValue('#增长策略 ');
  });

  it('opens # tag suggestions mid-prompt and clears tags from the input after send', async () => {
    const onSubmit = vi.fn();
    render(
      <HomeComposer
        bases={bases}
        availableTags={[{ id: '1', name: '增长策略' }]}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByPlaceholderText(homePlaceholder);
    fireEvent.change(input, { target: { value: '先问一句#', selectionStart: 5, selectionEnd: 5 } });
    expect(screen.getByRole('listbox', { name: '选择标签' })).toBeVisible();
    await userEvent.click(screen.getByRole('option', { name: '#增长策略' }));
    expect(input).toHaveValue('先问一句#增长策略 ');

    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '先问一句#增长策略',
      selectedTags: ['增长策略'],
    }));
    expect(input).toHaveValue('');
  });

  it('removes #tag from the prompt when deselecting a selected tag', async () => {
    render(<HomeComposer bases={bases} availableTags={[{ id: '1', name: '增长策略' }]} onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#增长策略' }));
    expect(screen.getByPlaceholderText(homePlaceholder)).toHaveValue('#增长策略 ');

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#增长策略' }));
    expect(screen.getByPlaceholderText(homePlaceholder)).toHaveValue('');
  });

  it('shows 暂无标签 when availableTags is empty instead of demo names', async () => {
    render(<HomeComposer bases={bases} availableTags={[]} onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    expect(screen.getByRole('listbox', { name: '选择标签' })).toBeVisible();
    expect(screen.getByText('暂无标签')).toBeVisible();
    expect(screen.queryByRole('option', { name: '#增长策略' })).not.toBeInTheDocument();
  });

  it('dismisses open scope menus on outside pointerdown and Escape', async () => {
    const user = userEvent.setup();
    render(<><HomeComposer bases={bases} availableTags={demoAvailableTags} onSubmit={vi.fn()} /><button type="button">页面其他位置</button></>);

    await user.click(screen.getByRole('button', { name: '选择知识库' }));
    expect(screen.getByRole('listbox', { name: '知识库选择' })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: '页面其他位置' }));
    expect(screen.queryByRole('listbox', { name: '知识库选择' })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(homePlaceholder), '#');
    expect(screen.getByRole('listbox', { name: '选择标签' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: '选择标签' })).not.toBeInTheDocument();
  });

  it('dismisses account, material filter, and history popovers', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '林知夏 个人账号' }));
    expect(screen.getByText('退出登录')).toBeVisible();
    fireEvent.pointerDown(screen.getByText('Welcome, Refind!'));
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '知识库' }));
    await user.click(screen.getByRole('button', { name: '筛选' }));
    expect(screen.getByText('按来源')).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('heading', { name: '默认知识库' }));
    expect(screen.queryByText('按来源')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '会话历史' }));
    expect(screen.getByText('会员活动设计')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('会员活动设计')).not.toBeInTheDocument();
  });

  it('confirms before invoking account deletion', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteAccount.mockResolvedValue(undefined);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '林知夏 个人账号' }));
    await userEvent.click(screen.getByRole('button', { name: '设置' }));
    await userEvent.click(screen.getByRole('tab', { name: '账户与安全' }));
    await userEvent.click(screen.getByRole('button', { name: '删除账号' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteAccount).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('keeps the selected scope on submitted messages without composer-generated citations', async () => {
    const onSubmit = vi.fn();
    render(<HomeComposer bases={bases} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '给我一个总结');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '给我一个总结',
      mode: 'rag',
      modelId: 'ds-fast',
      thinkingMode: 'fast',
      selectedBases: ['默认知识库'],
      selectedTags: [],
    }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('citations');
  });

  it('renders the chat API answer and resolves selected knowledge-base names to ids', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '基于资料回答');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(await screen.findByText('API 回答：基于资料回答')).toBeVisible();
    expect(screen.getByRole('button', { name: '引用 1：真实资料标题' })).toBeVisible();
    expect(sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: '基于资料回答',
      modelId: 'ds-fast',
      thinkingMode: 'fast',
      onlineEnabled: false,
      knowledgeBaseIds: ['base-default'],
      tagFilters: [],
      surface: 'home',
    }));
    // Single-KB home chats must remain visible in the home history card.
    expect(conversationStore.homeItems.some((item) => item.id)).toBe(true);
  });

  it('resolves selected tag names to tagFilter ids when sending home chat', async () => {
    render(<App />);

    await screen.findByPlaceholderText(homePlaceholder);
    await vi.waitFor(() => expect(listMaterialTags).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(homePlaceholder), { target: { value: '#' } });
    await userEvent.click(await screen.findByRole('option', { name: /产品灵感/ }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '带标签提问');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    await vi.waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: '#产品灵感 带标签提问',
      question: '#产品灵感 带标签提问',
      retrievalContent: '带标签提问\n产品灵感',
      tagFilters: ['tag-product'],
      selectedTags: ['产品灵感'],
    })));
  });

  it('clears KB composer selectedTags after send so the next ask is not stuck on old tags', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    const kbInput = await screen.findByPlaceholderText('基于当前知识库提问，输入 # 可选择标签');
    await vi.waitFor(() => expect(listMaterialTags).toHaveBeenCalled());
    await userEvent.type(kbInput, '#');
    await userEvent.click(await screen.findByRole('option', { name: '#产品灵感' }));
    await userEvent.clear(kbInput);
    await userEvent.type(kbInput, '第一次带标签');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    await vi.waitFor(() => expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '#产品灵感 第一次带标签',
      question: '#产品灵感 第一次带标签',
      retrievalContent: '第一次带标签\n产品灵感',
      tagFilters: ['tag-product'],
      selectedTags: ['产品灵感'],
      surface: 'knowledge',
    })));

    expect(screen.getByPlaceholderText('基于当前知识库提问，输入 # 可选择标签')).toHaveValue('');

    await userEvent.type(
      screen.getByPlaceholderText('基于当前知识库提问，输入 # 可选择标签'),
      '第二次追问',
    );
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    await vi.waitFor(() => expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '第二次追问',
      tagFilters: [],
      selectedTags: [],
      surface: 'knowledge',
    })));
  });

  it('submits the homepage prompt when Enter is pressed', async () => {
    const onSubmit = vi.fn();
    render(<HomeComposer bases={bases} onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText(homePlaceholder);
    await userEvent.type(input, '回车发送');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: '回车发送' }));
  });

  it('keeps a submitted homepage question on the home canvas and replaces the welcome hero with its conversation', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '帮我整理增长思路');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(screen.getByRole('button', { name: '首页' })).toHaveClass('is-active');
    expect(screen.getByText('帮我整理增长思路')).toBeVisible();
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增会话' })).toBeVisible();
    expect(screen.getByLabelText('会话历史')).toBeVisible();
    expect(screen.getByRole('button', { name: '搜索会话' })).toBeVisible();
    expect(screen.getByText('历史会话')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '知识库问答' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
  });

  it('lists the new home conversation before the AI answer returns', async () => {
    let releaseSend;
    const deferred = new Promise((resolve) => {
      releaseSend = resolve;
    });
    sendChatMessage.mockImplementationOnce(async (payload) => {
      await deferred;
      const conversationId = payload.conversationId || `conv-deferred-${Date.now()}`;
      const message = {
        id: `assistant-${payload.content}`,
        conversationId,
        question: payload.content,
        answer: `API 回答：${payload.content}`,
        mode: 'general',
        online: false,
        selectedBases: payload.selectedBases,
        selectedTags: payload.selectedTags,
        citations: [],
      };
      conversationStore.turnsById[conversationId] = [...(conversationStore.turnsById[conversationId] || []), message];
      conversationStore.homeItems = [{
        id: conversationId,
        title: `会话 · ${String(payload.content || '未命名').slice(0, 24)}`,
        updatedAt: new Date().toISOString(),
      }, ...conversationStore.homeItems.filter((item) => item.id !== conversationId)];
      return message;
    });

    render(<App />);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '先出现在历史里');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(await screen.findByLabelText('会话历史')).toBeVisible();
    expect(within(screen.getByLabelText('会话历史')).getByText('先出现在历史里')).toBeVisible();
    expect(screen.queryByText('API 回答：先出现在历史里')).not.toBeInTheDocument();

    releaseSend();
    expect(await screen.findByText('API 回答：先出现在历史里')).toBeVisible();
  });

  it('collapses the floating history card to a single reopen button', async () => {
    render(<App />);

    expect(screen.queryByLabelText('会话历史')).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '打开历史卡片');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(screen.getByLabelText('会话历史')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '收起会话历史' }));
    expect(screen.queryByLabelText('会话历史')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开会话历史' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '展开会话历史' }));
    expect(screen.getByLabelText('会话历史')).toBeVisible();
    expect(screen.getByText('历史会话')).toBeVisible();
  });

  it('returns to the hero homepage when the brand is clicked', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '进入对话后回首页');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '回到英雄区' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.queryByLabelText('会话历史')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
  });

  it('opens the latest history conversation when Home is clicked after brand returns to hero', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '保留的会话内容');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '回到英雄区' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(await screen.findByText('保留的会话内容')).toBeVisible();
    expect(screen.getByLabelText('会话历史')).toBeVisible();
    expect(screen.queryByText('新会话')).not.toBeInTheDocument();
    expect(screen.getByText(/会话 · 保留的会话内容/)).toBeVisible();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
  });

  it('does not persist an empty home draft when opening chat from hero after refresh-like hero return', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '已有会话');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await screen.findByText(/会话 · 已有会话/);
    expect(conversationStore.homeItems).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '回到英雄区' }));
    await userEvent.click(screen.getByRole('button', { name: '首页' }));

    expect(conversationStore.homeItems).toHaveLength(1);
    expect(screen.queryByText('新会话')).not.toBeInTheDocument();
    expect(screen.getByLabelText('会话历史')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '新增会话' }));
    expect(screen.getByText('新会话')).toBeVisible();
    expect(conversationStore.homeItems).toHaveLength(2);
  });

  it('does not continue the previous conversation when sending from hero after brand click', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '旧会话问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    expect(await screen.findByText('旧会话问题')).toBeVisible();
    expect(sendChatMessage).toHaveBeenCalled();
    const firstConversationId = sendChatMessage.mock.calls.at(-1)?.[0]?.conversationId
      || sendChatMessage.mock.results.at(-1)?.value?.conversationId
      || 'conv-test-1';
    // After the first reply lands, App keeps that conversation id for follow-ups.
    await screen.findByText(/API 回答：旧会话问题/);

    await userEvent.click(screen.getByRole('button', { name: '回到英雄区' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();

    sendChatMessage.mockClear();
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '英雄区新问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: '英雄区新问题',
    }));
    const resentId = sendChatMessage.mock.calls.at(-1)?.[0]?.conversationId;
    expect(resentId == null || resentId !== firstConversationId).toBe(true);
    expect(screen.getByText('英雄区新问题')).toBeVisible();
    expect(screen.queryByText('旧会话问题')).not.toBeInTheDocument();
  });

  it('keeps first-entry hero without Home hover until Home is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.getByRole('button', { name: '首页' })).toHaveClass('is-hover-locked');
    expect(screen.getByRole('button', { name: '首页' })).not.toHaveClass('is-active');
    expect(screen.getByRole('button', { name: '回到英雄区' })).not.toHaveClass('is-active');

    await user.hover(screen.getByRole('button', { name: '首页' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.queryByLabelText('会话历史')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.getByRole('button', { name: '首页' })).not.toHaveClass('is-hover-locked');
    // No history yet → still hero; Home stays inactive on hero.
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.getByRole('button', { name: '首页' })).not.toHaveClass('is-active');
  });

  it('opens the latest conversation from Home click/hover after unlock when history exists', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByPlaceholderText(homePlaceholder), '首次会话');
    await user.click(screen.getByRole('button', { name: '发送提问' }));
    expect(await screen.findByText('首次会话')).toBeVisible();
    expect(screen.getByRole('button', { name: '首页' })).toHaveClass('is-active');

    await user.click(screen.getByRole('button', { name: '回到英雄区' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.getByRole('button', { name: '首页' })).not.toHaveClass('is-active');
    expect(screen.getByRole('button', { name: '回到英雄区' })).not.toHaveClass('is-active');

    await user.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(await screen.findByText('首次会话')).toBeVisible();
    expect(screen.getByLabelText('会话历史')).toBeVisible();
    expect(screen.getByRole('button', { name: '首页' })).toHaveClass('is-active');

    await user.click(screen.getByRole('button', { name: '回到英雄区' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    // Move away from logo/Home so hover suppress clears, then re-enter Home.
    fireEvent.mouseLeave(screen.getByRole('button', { name: '回到英雄区' }), {
      relatedTarget: document.body,
    });
    await user.hover(screen.getByRole('button', { name: '首页' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(await screen.findByText('首次会话')).toBeVisible();
    expect(screen.getByLabelText('会话历史')).toBeVisible();
  });

  it('clears the chat bubbles when starting a new session without returning to hero', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '旧的问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    expect(screen.getByText('旧的问题')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '新增会话' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(screen.queryByText('旧的问题')).not.toBeInTheDocument();
    expect(screen.getByLabelText('会话历史')).toBeVisible();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
  });

  it('opens the latest knowledge-base history conversation when entering the page', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首页的问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '知识库' }));

    expect(screen.queryByText('首页的问题')).not.toBeInTheDocument();
    expect(await screen.findByText('会员活动怎么设计')).toBeVisible();
    expect(screen.getByText('可以先从目标用户和权益分层开始。')).toBeVisible();
  });

  it('keeps homepage and knowledge-base conversation messages isolated', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首页的问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '知识库' }));

    expect(screen.queryByText('首页的问题')).not.toBeInTheDocument();
    expect(await screen.findByText('会员活动怎么设计')).toBeVisible();
  });

  it('clears only the knowledge-base conversation when starting a new KB conversation', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '仍保留的首页问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    await userEvent.type(screen.getByPlaceholderText('基于当前知识库提问，输入 # 可选择标签'), '待清除的知识库问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    const kbPanel = screen.getByRole('heading', { name: '知识库问答' }).closest('.ai-panel');
    await userEvent.click(within(kbPanel).getByRole('button', { name: '新建会话' }));

    expect(screen.queryByText('待清除的知识库问题')).not.toBeInTheDocument();
    expect(screen.getByText('从你的知识库中寻找答案')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.getByText('仍保留的首页问题')).toBeVisible();
  });

  it('retains controlled base and tag scope when the home composer remounts', async () => {
    function Harness() {
      const [mounted, setMounted] = useState(true);
      const [scope, setScope] = useState({ online: true, selectedBases: [], selectedTags: [] });
      return <><button type="button" onClick={() => setMounted((value) => !value)}>切换页面</button>{mounted && <HomeComposer bases={bases} availableTags={demoAvailableTags} onSubmit={vi.fn()} scope={scope} onScopeChange={setScope} />}</>;
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '产品与设计资料' }));
    fireEvent.pointerDown(document.body);
    const input = screen.getByPlaceholderText(homePlaceholder);
    fireEvent.change(input, { target: { value: '#' } });
    expect(screen.getByRole('listbox', { name: '选择标签' })).toBeVisible();
    expect(screen.getByRole('option', { name: /产品灵感/ })).toBeVisible();
    await userEvent.click(screen.getByRole('option', { name: /产品灵感/ }));
    await userEvent.click(screen.getByRole('button', { name: '切换页面' }));
    await userEvent.click(screen.getByRole('button', { name: '切换页面' }));

    expect(screen.getByRole('button', { name: '选择知识库' })).toHaveTextContent('产品与设计资料');
    expect(screen.getByRole('button', { name: '不联网' })).toBeDisabled();
  });

  it('clears homepage tags after send while keeping selected knowledge bases', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '产品与设计资料' }));
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() => expect(listMaterialTags).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(homePlaceholder), { target: { value: '#' } });
    await userEvent.click(await screen.findByRole('option', { name: /产品灵感/ }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首个问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    await vi.waitFor(() => expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '#产品灵感 首个问题',
      question: '#产品灵感 首个问题',
      retrievalContent: '首个问题\n产品灵感',
      tagFilters: ['tag-product'],
      selectedTags: ['产品灵感'],
    })));
    expect(screen.getByPlaceholderText(homePlaceholder)).toHaveValue('');
    expect(screen.getByText(/默认知识库、产品与设计资料、#产品灵感/)).toBeVisible();

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '后续问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    await vi.waitFor(() => expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '后续问题',
      tagFilters: [],
      selectedTags: [],
    })));
    expect(screen.getAllByText(/默认知识库、产品与设计资料、#产品灵感/)).toHaveLength(1);
    expect(screen.getByText(/^默认知识库、产品与设计资料$/)).toBeVisible();
  });

  it('clears active conversation scope when homepage bases are deselected', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    await vi.waitFor(() => expect(listMaterialTags).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText(homePlaceholder), { target: { value: '#' } });
    await userEvent.click(await screen.findByRole('option', { name: /产品灵感/ }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首个问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    fireEvent.change(screen.getByPlaceholderText(homePlaceholder), { target: { value: '#' } });
    await userEvent.click(await screen.findByRole('option', { name: /产品灵感/ }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '范围已清后的追问');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(screen.getByText(/默认知识库、#产品灵感/)).toBeVisible();
    expect(screen.queryAllByText(/默认知识库、#产品灵感/)).toHaveLength(1);
    expect(screen.getByText('范围已清后的追问').closest('.home-conversation-turn')).toBeTruthy();
    expect(await screen.findByText(/API 回答：范围已清后的追问/)).toBeVisible();
  });

  it('switches from online general to RAG after selecting a knowledge base', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '不联网' }));
    expect(screen.getByRole('button', { name: '联网' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '先联网闲聊');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    expect(await screen.findByText('API 回答：先联网闲聊')).toBeVisible();
    expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '先联网闲聊',
      modelId: 'qwen',
      thinkingMode: 'fast',
      onlineEnabled: true,
      knowledgeBaseIds: [],
      surface: 'home',
    }));

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('button', { name: '不联网' })).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '大模型架构是什么');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(await screen.findByText('API 回答：大模型架构是什么')).toBeVisible();
    expect(sendChatMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      content: '大模型架构是什么',
      modelId: expect.stringMatching(/^ds-(fast|deep)$/),
      onlineEnabled: false,
      knowledgeBaseIds: ['base-default'],
      surface: 'home',
    }));
    expect(sendChatMessage.mock.calls.at(-1)[0].modelId).not.toBe('qwen');
    expect(screen.getAllByText(/默认知识库/).length).toBeGreaterThan(0);
  });
});
