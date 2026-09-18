import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoInspirationCards, demoNotes, demoNotebooks } from './demoData.js';
import { NotesWorkspace } from './NotesWorkspace.jsx';
import { NoteEditor } from './NoteEditor.jsx';
import { AnswerActions } from '../knowledge/AnswerActions.jsx';

const noteEditorCapture = vi.hoisted(() => ({ latest: null }));

const notesApi = vi.hoisted(() => ({
  listNotes: vi.fn(async () => demoNotes),
  createNote: vi.fn(async () => ({
    id: 'persisted-note',
    title: '未命名笔记',
    content: { text: '', blocks: [], sections: [] },
    notebookId: null,
    inspirationCardIds: [],
    materialThoughts: {},
    updatedLabel: '刚刚创建',
  })),
  updateNote: vi.fn(async (_id, patch) => patch),
  deleteNote: vi.fn(async () => {}),
  listNotebooks: vi.fn(async () => demoNotebooks),
  createNotebook: vi.fn(),
  renameNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
  listInspirationCards: vi.fn(async () => demoInspirationCards),
  createInspirationCard: vi.fn(),
  deleteInspirationCard: vi.fn(),
  setNoteMaterials: vi.fn(async () => []),
  generateNote: vi.fn(async () => ({})),
  outlineNoteMaterials: vi.fn(async () => ({})),
  syncNote: vi.fn(async ({ knowledgeBaseIds }) => ({
    noteId: 'n1',
    synced: (knowledgeBaseIds || []).map((knowledgeBaseId) => ({
      knowledgeBaseId,
      materialId: `mat-${knowledgeBaseId}`,
    })),
    failed: [],
    knowledgeBaseIds: knowledgeBaseIds || [],
  })),
  resolveCardOriginLabel: (card, knowledgeBases = []) => {
    if (card?.answerMode !== 'rag') return card?.sourceLabel || '通用回答';
    const id = card?.sourceKnowledgeBaseIds?.[0];
    return knowledgeBases.find((base) => base.id === id)?.name || '知识库回答';
  },
  formatCardPreviewText: (text) => String(text || '').replace(/\*\*/g, ''),
  resolveCardMaterialLabels: (card) => (card?.citation?.label ? [card.citation.label] : []),
  resolveCardCitedMaterials: () => [],
  citationsForCardDisplay: () => [],
  cardMatchesTimeFilter: () => true,
  cardMatchesOriginFilter: (card, originFilter = 'all') => {
    if (!originFilter || originFilter === 'all') return true;
    if (originFilter === 'general') return card?.answerMode !== 'rag';
    return (card?.sourceKnowledgeBaseIds || []).includes(originFilter);
  },
}));

const { demoSession, supabase } = vi.hoisted(() => {
  const session = {
    access_token: 'test-access-token',
    token_type: 'bearer',
    user: { id: 'test-user-1', email: 'demo@refind.test' },
  };
  return {
    demoSession: session,
    supabase: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

vi.mock('../../lib/supabaseClient.js', () => ({ supabase }));
vi.mock('../../lib/api/notes.js', () => notesApi);
vi.mock('./NoteEditor.jsx', async () => {
  const actual = await vi.importActual('./NoteEditor.jsx');
  return {
    ...actual,
    NoteEditor: (props) => {
      noteEditorCapture.latest = props;
      return actual.NoteEditor(props);
    },
  };
});

vi.mock('../../lib/api/auth.js', () => ({
  getSession: () => ({
    then: (resolve) => {
      resolve({ data: { session: demoSession }, error: null });
      return { catch() {} };
    },
  }),
  signOut: async () => ({ error: null }),
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

import { App } from '../../App.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function NotesHarness({ notice = vi.fn() } = {}) {
  const [notes, setNotes] = useState(demoNotes);

  return <NotesWorkspace notes={notes} setNotes={setNotes} cards={demoInspirationCards} notebooks={demoNotebooks} notice={notice} />;
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
      await userEvent.click(screen.getByRole('button', { name: '知识库问答', hidden: true }));
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

  it('disables generation without material and shows 生成中 while generating', async () => {
    const cards = [{
      id: 'rag-card',
      contentSnapshot: '缩短首次价值时间，让用户更快完成关键动作。',
      questionSnapshot: '怎样改善新用户激活？',
      answerMode: 'rag',
      citation: { label: '小红书增长策略' },
    }];
    const emptyNote = { id: 'empty', title: '未命名笔记', content: { text: '', blocks: [] }, inspirationCardIds: [] };
    const noteWithCards = { ...emptyNote, id: 'with-card', inspirationCardIds: ['rag-card'] };
    let resolveGenerate;
    const onGenerate = vi.fn(() => new Promise((resolve) => {
      resolveGenerate = resolve;
    }));
    const Harness = ({ note }) => {
      const [current, setCurrent] = useState(note);
      return <NoteEditor mode="inspiration" showMaterials note={current} cards={cards} onChange={setCurrent} onGenerate={onGenerate} />;
    };

    const { unmount } = render(<Harness note={emptyNote} />);
    expect(screen.getByRole('button', { name: '生成笔记' })).toBeDisabled();
    unmount();

    render(<Harness note={noteWithCards} />);
    expect(screen.getByRole('button', { name: '生成笔记' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: '生成笔记' }));
    expect(onGenerate).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /生成中/ })).toBeDisabled();
    resolveGenerate();
    expect(await screen.findByRole('button', { name: '生成笔记' })).toBeEnabled();
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
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '反馈' })).toBeVisible();
    fireEvent.pointerDown(screen.getByRole('button', { name: '页面其他位置' }));
    expect(screen.queryByRole('menuitem', { name: '删除' })).not.toBeInTheDocument();
  });

  it('opens the capture menu when text in the answer body is selected', () => {
    const answer = { content: '正文中被划选的一段话。', answerMode: 'general' };
    const originalSelection = window.getSelection;
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        toString: () => answer.content,
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            top: 120,
            left: 180,
            right: 280,
            bottom: 140,
            width: 100,
            height: 20,
          }),
          getClientRects: () => [],
        }),
      }),
    });

    render(<AnswerActions answer={answer} onSaveCard={vi.fn()} onAddToNote={vi.fn()}><p>{answer.content}</p></AnswerActions>);
    fireEvent.mouseUp(screen.getByText(answer.content));

    const menu = screen.getByRole('menu', { name: '收藏回答' });
    expect(menu).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '保存为灵感卡片' })).toBeVisible();
    // Fixed compact width — never stretch with the selection.
    expect(menu.style.width).toBe('168px');
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThan(100);
    Object.defineProperty(window, 'getSelection', { configurable: true, value: originalSelection });
  });

  it('does not reopen capture menu when clicking copy while text stays selected', async () => {
    const answer = { content: '正文中被划选的一段话。', answerMode: 'general' };
    const originalSelection = window.getSelection;
    Object.defineProperty(window, 'getSelection', {
      configurable: true,
      value: () => ({
        toString: () => answer.content,
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            top: 120, left: 180, right: 280, bottom: 140, width: 100, height: 20,
          }),
          getClientRects: () => [],
        }),
      }),
    });

    render(<AnswerActions answer={answer} onSaveCard={vi.fn()} onAddToNote={vi.fn()}><p>{answer.content}</p></AnswerActions>);
    fireEvent.mouseUp(screen.getByText(answer.content));
    expect(screen.getByRole('menu', { name: '收藏回答' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '复制回答' }));
    expect(screen.queryByRole('menu', { name: '收藏回答' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已复制' })).toBeVisible();
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

    expect(notesApi.createNote).toHaveBeenCalledWith();
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

  it('debounces title autosave through the notes API', async () => {
    render(<NotesHarness />);

    fireEvent.change(screen.getByLabelText('笔记标题'), { target: { value: '持久化标题' } });

    await waitFor(() => {
      expect(notesApi.updateNote).toHaveBeenCalledWith('note-membership', {
        title: '持久化标题',
        content: demoNotes[0].content,
      });
    }, { timeout: 1500 });
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
    expect(screen.queryByRole('button', { name: '素材面板' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '收起素材面板' }));
    expect(screen.queryByRole('region', { name: '素材面板' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开素材面板' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '展开素材面板' }));
    expect(screen.getByRole('region', { name: '素材面板' })).toBeVisible();
  });

  it('loads a selected note without focusing its body', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: /会员活动设计/ }));

    expect(screen.getByDisplayValue('会员活动设计')).toBeVisible();
    expect(document.activeElement).not.toBe(screen.getByLabelText('笔记正文'));
  });

  it('keeps inspiration search adjacent to organize with manage and a filter between them', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('tab', { name: '灵感卡片' }));

    expect(screen.getByLabelText('搜索灵感卡片')).toBeVisible();
    expect(screen.getByRole('button', { name: '筛选灵感卡片' })).toBeVisible();
    expect(screen.getByRole('button', { name: '管理' })).toBeVisible();
    expect(screen.getByRole('button', { name: '整理为笔记' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '筛选灵感卡片' }));
    expect(screen.getByRole('menu', { name: '灵感卡片筛选' })).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: '今天' })).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: '通用回答' })).toBeVisible();
  });

  it('batch-deletes managed cards after a single confirm', async () => {
    const onDeleteCard = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const cards = [
      { id: 'c1', contentSnapshot: '卡片一', questionSnapshot: 'q1', answerMode: 'general', sourceLabel: '通用回答', savedAt: '今天' },
      { id: 'c2', contentSnapshot: '卡片二', questionSnapshot: 'q2', answerMode: 'general', sourceLabel: '通用回答', savedAt: '今天' },
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
          onDeleteCard={onDeleteCard}
        />
      );
    };
    render(<Harness />);

    await userEvent.click(screen.getByRole('tab', { name: '灵感卡片' }));
    await userEvent.click(screen.getByRole('button', { name: '管理' }));
    await userEvent.click(screen.getByLabelText('选择卡片：c1'));
    await userEvent.click(screen.getByLabelText('选择卡片：c2'));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onDeleteCard).toHaveBeenCalledTimes(2);
    expect(onDeleteCard).toHaveBeenCalledWith('c1');
    expect(onDeleteCard).toHaveBeenCalledWith('c2');
    confirmSpy.mockRestore();
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

  it('syncs note to selected knowledge bases via syncNote API', async () => {
    const notice = vi.fn();
    notesApi.syncNote.mockClear();
    render(<NotesHarness notice={notice} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /会员活动设计/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '添加至知识库' }));
    await userEvent.click(screen.getByLabelText('产品与设计资料'));
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(notice).toHaveBeenCalledWith(expect.stringMatching(/同步中/));
    });
    expect(notesApi.syncNote).toHaveBeenCalledWith({
      noteId: 'note-membership',
      knowledgeBaseIds: ['base-product'],
    });
    await waitFor(() => {
      expect(notice).toHaveBeenCalledWith('已同步至 1 个知识库。');
    });

    fireEvent.contextMenu(screen.getByRole('button', { name: /会员活动设计/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '查看知识库' }));
    expect(screen.getByRole('dialog', { name: '已同步知识库' })).toBeVisible();
    expect(screen.getByText('产品与设计资料')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '知道了' }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /会员活动设计/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));

    expect(screen.getByText(/删除后无法恢复/)).toBeVisible();
    expect(screen.getByText(/不会删除灵感卡片/)).toBeVisible();
  });

  it('generateFullscreenNote preserves existing content.outline when API omits outline', async () => {
    const existingOutline = {
      version: 1,
      chapters: [{ id: 'ch1', title: '开场', cardIds: ['card-onboarding'] }],
      unassignedCardIds: ['card-retrospective'],
    };
    notesApi.generateNote.mockResolvedValue({
      id: 'note-with-cards',
      title: '带素材笔记',
      content: {
        text: 'generated body',
        blocks: [{ type: 'paragraph', text: 'generated body' }],
        sections: [],
      },
      inspirationCardIds: ['card-onboarding', 'card-retrospective'],
      materialThoughts: {},
      updatedLabel: '刚刚生成',
    });

    const notes = [{
      ...demoNotes[0],
      id: 'note-with-cards',
      title: '带素材笔记',
      inspirationCardIds: ['card-onboarding'],
      content: {
        text: '',
        blocks: [],
        sections: [],
        outline: existingOutline,
      },
    }];

    let latestNotes = notes;
    const Harness = () => {
      const [items, setItems] = useState(notes);
      const captureSetNotes = (updater) => {
        setItems((prev) => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          latestNotes = next;
          return next;
        });
      };
      return (
        <NotesWorkspace
          notes={items}
          setNotes={captureSetNotes}
          cards={demoInspirationCards}
          notebooks={demoNotebooks}
          notice={vi.fn()}
        />
      );
    };

    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /带素材笔记/ }));
    await userEvent.click(screen.getByRole('button', { name: '全屏编辑' }));

    await noteEditorCapture.latest.onGenerate();

    await waitFor(() => {
      const updated = latestNotes.find((note) => note.id === 'note-with-cards');
      expect(updated?.content?.outline).toEqual(existingOutline);
      expect(updated?.content?.text).toBe('generated body');
    });
  });

  it('outlineFullscreenNote invokes outline API and merges local materials', async () => {
    const notice = vi.fn();
    notesApi.outlineNoteMaterials.mockResolvedValue({
      id: 'note-with-cards',
      title: '带素材笔记',
      notebookId: null,
      content: {
        text: '',
        blocks: [],
        sections: [],
        outline: {
          version: 1,
          chapters: [{ id: 'ch1', title: '开场', cardIds: ['card-onboarding'] }],
          unassignedCardIds: ['card-retrospective'],
        },
      },
      inspirationCardIds: ['card-onboarding', 'card-retrospective'],
      materialThoughts: {},
      syncedBaseIds: [],
      updatedLabel: '刚刚成章',
    });

    const notes = [{
      ...demoNotes[0],
      id: 'note-with-cards',
      title: '带素材笔记',
      inspirationCardIds: ['card-onboarding', 'card-retrospective'],
      materialThoughts: { 'card-onboarding': 'local' },
    }];

    const Harness = () => {
      const [items, setItems] = useState(notes);
      return (
        <NotesWorkspace
          notes={items}
          setNotes={setItems}
          cards={demoInspirationCards}
          notebooks={demoNotebooks}
          notice={notice}
        />
      );
    };

    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /带素材笔记/ }));
    await userEvent.click(screen.getByRole('button', { name: '全屏编辑' }));

    expect(noteEditorCapture.latest?.onOutline).toEqual(expect.any(Function));
    expect(noteEditorCapture.latest?.onRetryOutline).toEqual(expect.any(Function));
    await noteEditorCapture.latest.onOutline();

    expect(notesApi.outlineNoteMaterials).toHaveBeenCalledWith('note-with-cards');
    expect(notice).toHaveBeenCalledWith('已生成章节大纲。');
  });

  it('offers unfile or permanent deletion choices when deleting a non-empty notebook', async () => {
    render(<NotesHarness />);

    await userEvent.click(screen.getByRole('button', { name: '笔记本' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '管理笔记本' }));
    const dialog = screen.getByRole('dialog', { name: '管理笔记本' });
    await userEvent.click(within(dialog).getByRole('option', { name: /增长实验/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: '删除笔记本：增长实验' }));

    expect(screen.getByRole('dialog', { name: '删除笔记本' })).toBeVisible();
    expect(screen.getByRole('button', { name: '仅删除笔记本' })).toBeVisible();
    expect(screen.getByRole('button', { name: '连同笔记删除' })).toBeVisible();
  });
});
