import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComposer } from './HomeComposer.jsx';

const { deleteAccount, demoSession, supabase } = vi.hoisted(() => {
  const session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    user: { id: 'test-user-1', email: 'demo@refind.test' },
  };
  return {
    deleteAccount: vi.fn(),
    demoSession: session,
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

vi.mock('../../lib/supabaseClient.js', () => ({ supabase }));

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

vi.mock('../../lib/api/knowledge.js', () => {
  const demoKnowledgeBases = [
    { id: 'base-default', name: '默认知识库', type: 'default' },
    { id: 'base-growth', name: '增长与运营案例', type: 'custom' },
    { id: 'base-product', name: '产品与设计资料', type: 'custom' },
  ];
  return {
    listKnowledgeBases: async () => demoKnowledgeBases,
    createKnowledgeBase: async ({ name }) => ({ id: `base-${name}`, name, type: 'custom' }),
  };
});

import { App } from '../../App.jsx';

const bases = ['默认知识库', '增长与运营案例', '产品与设计资料'];
const homePlaceholder = '请输入内容进行提问，输入 # 可选择标签';

afterEach(cleanup);

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
    expect(screen.getByRole('dialog', { name: 'DeepSeek 模型设置' })).toBeVisible();
    expect(screen.getByRole('button', { name: '快速' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '深度' }));
    expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS深度');
    expect(screen.getByRole('button', { name: '深度' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('forces offline when a knowledge base is selected', async () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '增长与运营案例' }));

    expect(screen.getByRole('button', { name: '不联网' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '不联网' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '选择知识库' })).toHaveTextContent('增长与运营案例');
  });

  it('shows multi-base label and opens hash tag suggestions', async () => {
    render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);

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

  it('dismisses open scope menus on outside pointerdown and Escape', async () => {
    const user = userEvent.setup();
    render(<><HomeComposer bases={bases} onSubmit={vi.fn()} /><button type="button">页面其他位置</button></>);

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
    await userEvent.click(screen.getByRole('button', { name: '删除账号' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteAccount).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('keeps the selected scope on submitted messages and reports fixed RAG citations', async () => {
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
      selectedBases: ['默认知识库'],
      selectedTags: [],
      citations: [{ label: '小红书增长策略' }, { label: 'SaaS 增长复盘' }],
    }));
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
    expect(screen.queryByRole('heading', { name: 'AI 对话' })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
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

    await userEvent.click(screen.getByRole('button', { name: '回到首页' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();
    expect(screen.queryByLabelText('会话历史')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(homePlaceholder)).toBeVisible();
  });

  it('restores the previous chat when Home is clicked after brand returns to hero', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '保留的会话内容');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '回到首页' }));
    expect(screen.getByText('Welcome, Refind!')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.queryByText('Welcome, Refind!')).not.toBeInTheDocument();
    expect(screen.getByText('保留的会话内容')).toBeVisible();
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

  it('keeps homepage and knowledge-base conversation messages isolated', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首页的问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '知识库' }));

    expect(screen.queryByText('首页的问题')).not.toBeInTheDocument();
    expect(screen.getByText('从你的资料里找答案')).toBeVisible();
  });

  it('clears only the knowledge-base conversation when starting a new KB conversation', async () => {
    render(<App />);

    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '仍保留的首页问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    await userEvent.type(screen.getByPlaceholderText('基于当前知识库提问，输入 # 可选择标签'), '待清除的知识库问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    const kbPanel = screen.getByRole('heading', { name: 'AI 对话' }).closest('.ai-panel');
    await userEvent.click(within(kbPanel).getByRole('button', { name: '新建会话' }));

    expect(screen.queryByText('待清除的知识库问题')).not.toBeInTheDocument();
    expect(screen.getByText('从你的资料里找答案')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '首页' }));
    expect(screen.getByText('仍保留的首页问题')).toBeVisible();
  });

  it('retains controlled base and tag scope when the home composer remounts', async () => {
    function Harness() {
      const [mounted, setMounted] = useState(true);
      const [scope, setScope] = useState({ online: true, selectedBases: [], selectedTags: [] });
      return <><button type="button" onClick={() => setMounted((value) => !value)}>切换页面</button>{mounted && <HomeComposer bases={bases} onSubmit={vi.fn()} scope={scope} onScopeChange={setScope} />}</>;
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '产品与设计资料' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#产品灵感' }));
    await userEvent.click(screen.getByRole('button', { name: '切换页面' }));
    await userEvent.click(screen.getByRole('button', { name: '切换页面' }));

    expect(screen.getByRole('button', { name: '选择知识库' })).toHaveTextContent('产品与设计资料');
    expect(screen.getByRole('button', { name: '不联网' })).toBeDisabled();
  });

  it('keeps multi-base and tag scope for homepage conversation follow-ups', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '产品与设计资料' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#产品灵感' }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首个问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '后续问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(screen.getAllByText(/默认知识库、产品与设计资料、#产品灵感/)).toHaveLength(2);
  });

  it('clears active conversation scope when homepage bases are deselected', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#产品灵感' }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '首个问题');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));
    await userEvent.click(screen.getByRole('button', { name: '选择知识库' }));
    await userEvent.click(screen.getByRole('option', { name: '默认知识库' }));
    fireEvent.pointerDown(document.body);
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '#');
    await userEvent.click(screen.getByRole('option', { name: '#产品灵感' }));
    await userEvent.clear(screen.getByPlaceholderText(homePlaceholder));
    await userEvent.type(screen.getByPlaceholderText(homePlaceholder), '范围已清后的追问');
    await userEvent.click(screen.getByRole('button', { name: '发送提问' }));

    expect(screen.getByText(/默认知识库、#产品灵感/)).toBeVisible();
    expect(screen.queryAllByText(/默认知识库、#产品灵感/)).toHaveLength(1);
    expect(screen.getByText('范围已清后的追问').closest('.home-conversation-turn')).toBeTruthy();
    expect(screen.getAllByText('这里有三个可先行验证的通用方向：')).toHaveLength(1);
  });
});
