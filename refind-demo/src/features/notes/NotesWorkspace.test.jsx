import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoInspirationCards, demoNotes, demoNotebooks } from './demoData.js';
import { NotesWorkspace } from './NotesWorkspace.jsx';
import { NoteEditor } from './NoteEditor.jsx';
import { AnswerActions } from '../knowledge/AnswerActions.jsx';
import { App } from '../../App.jsx';

afterEach(cleanup);

function NotesHarness() {
  const [notes, setNotes] = useState(demoNotes);

  return <NotesWorkspace notes={notes} setNotes={setNotes} cards={demoInspirationCards} notebooks={demoNotebooks} notice={vi.fn()} />;
}

describe('NotesWorkspace', () => {
  it('closes the mobile AI overlay after tapping the close control', async () => {
    const { matchMedia } = window;
    window.matchMedia = (query) => ({
      matches: false,
      media: String(query),
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    try {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: '知识库' }));
      await userEvent.click(screen.getByRole('button', { name: 'AI 对话', hidden: true }));
      expect(document.querySelector('.ai-panel')).toHaveClass('is-open');
      await userEvent.click(document.querySelector('.ai-panel-close'));
      expect(document.querySelector('.ai-panel')).not.toHaveClass('is-open');
      expect(document.querySelector('.ai-panel')).toHaveAttribute('data-open', 'false');
    } finally {
      window.matchMedia = matchMedia;
      cleanup();
    }
  });

  it('collapses global navigation while keeping destinations accessible', async () => {
    render(<App />);

    const toggle = screen.getByRole('button', { name: '收起导航' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);

    expect(screen.getByRole('button', { name: '展开导航' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '首页' })).toBeVisible();
    expect(screen.getByRole('button', { name: '笔记' })).toBeVisible();
    expect(screen.getByRole('button', { name: '知识库' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新建知识库' })).toBeVisible();
  });

  it('opens the mobile drawer and closes it after navigation', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '打开导航' }));
    expect(screen.getByRole('navigation', { name: '主导航' })).toHaveAttribute('data-mobile-open', 'true');

    await userEvent.click(screen.getByRole('button', { name: '笔记' }));
    expect(screen.getByRole('navigation', { name: '主导航' })).toHaveAttribute('data-mobile-open', 'false');
  });

  it('disables generation without material and replaces the body after deterministic generation', async () => {
    const cards = [{
      id: 'rag-card',
      contentSnapshot: '缩短首次价值时间，让用户更快完成关键动作。',
      questionSnapshot: '怎样改善新用户激活？',
      answerMode: 'rag',
      citation: { label: '小红书增长策略' },
    }];
    const emptyNote = { id: 'empty', title: '未命名笔记', content: { text: '', blocks: [] }, inspirationCardIds: [] };
    const noteWithCards = { ...emptyNote, id: 'with-card', inspirationCardIds: ['rag-card'] };
    const Harness = ({ note }) => {
      const [current, setCurrent] = useState(note);
      return <NoteEditor mode="inspiration" showMaterials note={current} cards={cards} onChange={setCurrent} />;
    };

    const { unmount } = render(<Harness note={emptyNote} />);
    expect(screen.getByRole('button', { name: '生成笔记' })).toBeDisabled();
    unmount();

    render(<Harness note={noteWithCards} />);
    await userEvent.click(screen.getByRole('button', { name: '生成笔记' }));
    expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: '小红书增长策略 引用' })).toBeVisible(), { timeout: 1200 });
  });

  it('offers card save and add-to-note choices from an answer action', async () => {
    const answer = {
      content: '将首次关键动作拆解为一个低摩擦步骤。',
      question: '怎样缩短新用户看到价值的时间？',
      answerMode: 'rag',
      citation: { label: '小红书增长策略' },
    };

    render(<><AnswerActions answer={answer} onSaveCard={vi.fn()} onAddToNote={vi.fn()} /><button type="button">页面其他位置</button></>);
    const actions = screen.getByLabelText('回答操作');
    const buttons = within(actions).getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-label', '复制回答');
    expect(buttons[1]).toHaveAttribute('aria-label', '收藏整条回答');

    await userEvent.click(screen.getByRole('button', { name: '复制回答' }));
    expect(screen.getByRole('button', { name: '已复制' })).toBeVisible();
    expect(screen.getByText('已复制')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '收藏整条回答' }));
    expect(screen.getByRole('menuitem', { name: '保存为灵感卡片' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '加入笔记' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('menuitem', { name: '删除回答' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '反馈' })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: '页面其他位置' }));
    expect(screen.queryByRole('menuitem', { name: '删除回答' })).not.toBeInTheDocument();
  });

  it('opens the capture menu when text in the answer body is selected', () => {
    const answer = { content: '正文中被划选的一段话。', answerMode: 'general' };
    const originalSelection = window.getSelection;
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({ toString: () => answer.content }),
    });

    render(<AnswerActions answer={answer} onSaveCard={vi.fn()} onAddToNote={vi.fn()}><p>{answer.content}</p></AnswerActions>);
    fireEvent.mouseUp(screen.getByText(answer.content));

    expect(screen.getByRole('menuitem', { name: '保存为灵感卡片' })).toBeVisible();
    Object.defineProperty(window, 'getSelection', { configurable: true, value: originalSelection });
  });

  it('shows compact header without eyebrow and black create control', () => {
    render(<NotesHarness />);

    expect(screen.getByRole('heading', { name: '笔记', level: 1 })).toBeVisible();
    expect(screen.queryByText('个人记录')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建笔记' })).toHaveClass('notes-workspace__create');
  });

  it('places search before notebook menu on one compact row', () => {
    render(<NotesHarness />);

    const controls = screen.getByTestId('notes-list-controls');
    expect(controls).toHaveClass('notes-list__controls');
    const search = within(controls).getByPlaceholderText('搜索笔记');
    const notebookMenu = within(controls).getByRole('button', { name: '笔记本' });
    expect(search).toBeVisible();
    expect(notebookMenu).toBeVisible();
    expect(controls.children[0]).toContainElement(search);
    expect(controls.children[1]).toContainElement(notebookMenu);
  });

  it('opens blank create notes in fullscreen without materials panel', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: '新建笔记' }));

    expect(screen.getByDisplayValue('未命名笔记')).toBeVisible();
    expect(screen.getByRole('button', { name: '返回笔记' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '素材面板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成笔记' })).not.toBeInTheDocument();
  });

  it('returns from fullscreen to 我的笔记 with the note selected', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: '新建笔记' }));
    await userEvent.click(screen.getByRole('button', { name: '返回笔记' }));

    expect(screen.getByRole('tab', { name: '我的笔记' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByDisplayValue('未命名笔记')).toBeVisible();
    expect(screen.getByRole('button', { name: /未命名笔记/ })).toHaveClass('is-selected');
  });

  it('enters fullscreen from the dual-pane icon and shows materials when note has cards', async () => {
    const notes = [{
      ...demoNotes[0],
      id: 'note-with-cards',
      title: '带素材笔记',
      inspirationCardIds: [demoInspirationCards[0].id],
    }];
    const Harness = () => {
      const [items, setItems] = useState(notes);
      return <NotesWorkspace notes={items} setNotes={setItems} cards={demoInspirationCards} notebooks={demoNotebooks} notice={vi.fn()} />;
    };
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /带素材笔记/ }));
    await userEvent.click(screen.getByRole('button', { name: '全屏编辑' }));

    expect(screen.getByRole('button', { name: '返回笔记' })).toBeVisible();
    expect(screen.getByRole('region', { name: '素材面板' })).toBeVisible();
  });

  it('loads a selected note without focusing its body', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: /会员活动设计/ }));

    expect(screen.getByDisplayValue('会员活动设计')).toBeVisible();
    expect(document.activeElement).not.toBe(screen.getByLabelText('笔记正文'));
  });

  it('keeps inspiration search adjacent to organize without a filter control', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('tab', { name: '灵感卡片' }));

    expect(screen.queryByRole('button', { name: '筛选灵感卡片' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('搜索灵感卡片')).toBeVisible();
    expect(screen.getByRole('button', { name: '整理为笔记' })).toBeVisible();
  });

  it('enters selection mode from organize and carries visible-list order into a note with materials', async () => {
    const onCreateOrganizedNote = vi.fn();
    const cards = [
      { id: 'c3', contentSnapshot: '第三张卡片', questionSnapshot: '问题三', answerMode: 'general', sourceLabel: '首页通用 AI', savedAt: '刚刚收藏' },
      { id: 'c2', contentSnapshot: '第二张卡片', questionSnapshot: '问题二', answerMode: 'rag', sourceLabel: '产品与设计资料', savedAt: '今天 11:00', citation: { label: '产品访谈' } },
      { id: 'c1', contentSnapshot: '第一张卡片', questionSnapshot: '问题一', answerMode: 'general', sourceLabel: '首页通用 AI', savedAt: '昨天' },
    ];
    const Harness = () => {
      const [notes, setNotes] = useState(demoNotes);
      return (
        <NotesWorkspace
          notes={notes}
          setNotes={setNotes}
          cards={cards}
          notebooks={demoNotebooks}
          notice={vi.fn()}
          onCreateOrganizedNote={onCreateOrganizedNote}
        />
      );
    };
    render(<Harness />);

    await userEvent.click(screen.getByRole('tab', { name: '灵感卡片' }));
    await userEvent.click(screen.getByRole('button', { name: '整理为笔记' }));
    await userEvent.click(screen.getByLabelText('选择卡片：c3'));
    await userEvent.click(screen.getByLabelText('选择卡片：c1'));
    await userEvent.click(screen.getByRole('button', { name: '开始整理' }));

    expect(onCreateOrganizedNote).toHaveBeenCalledWith(['c3', 'c1']);
    expect(screen.getByRole('button', { name: '返回笔记' })).toBeVisible();
    expect(screen.getByRole('region', { name: '素材面板' })).toBeVisible();
    expect(screen.getByRole('button', { name: '生成笔记' })).toBeVisible();
  });

  it('shows non-blocking multi-base sync progress and preserves cards when deleting a note', async () => {
    render(<NotesHarness />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /会员活动设计/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '添加至知识库' }));
    await userEvent.click(screen.getByLabelText('产品与设计资料'));
    await userEvent.click(screen.getByRole('button', { name: '确认同步' }));

    expect(screen.getByRole('status')).toHaveTextContent('正在同步至 1 个知识库');

    fireEvent.contextMenu(screen.getByRole('button', { name: /会员活动设计/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));

    expect(screen.getByText(/将同步删除 1 条知识库资料/)).toBeVisible();
    expect(screen.getByText(/不会删除灵感卡片/)).toBeVisible();
  });

  it('offers unfile or permanent deletion choices when deleting a non-empty notebook', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: '笔记本' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '管理笔记本' }));
    await userEvent.click(screen.getByRole('button', { name: '删除笔记本：增长实验' }));

    expect(screen.getByRole('dialog', { name: '删除笔记本' })).toBeVisible();
    expect(screen.getByRole('button', { name: '仅删除笔记本' })).toBeVisible();
    expect(screen.getByRole('button', { name: '连同笔记删除' })).toBeVisible();
  });
});
