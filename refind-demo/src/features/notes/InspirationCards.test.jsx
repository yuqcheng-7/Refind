import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspirationCards } from './InspirationCards.jsx';

afterEach(cleanup);

const cards = [
  {
    id: 'general-today',
    contentSnapshot: '通用今天',
    questionSnapshot: 'q1',
    answerMode: 'general',
    sourceLabel: '通用回答',
    createdAt: new Date().toISOString(),
    savedAt: '今天',
  },
  {
    id: 'rag-kb',
    contentSnapshot: '1. **知识库卡片**：带 markdown',
    questionSnapshot: 'q2',
    answerMode: 'rag',
    sourceLabel: '知识库回答',
    sourceKnowledgeBaseIds: ['base-growth'],
    createdAt: new Date().toISOString(),
    savedAt: '今天',
  },
];

describe('InspirationCards filters', () => {
  it('shows knowledge-base name and readable cover text', () => {
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[{ id: 'base-growth', name: '增长知识库' }]}
        onCreateOrganizedNote={vi.fn()}
      />,
    );

    expect(screen.getByText('增长知识库')).toBeVisible();
    expect(screen.getByText('1. 知识库卡片：带 markdown')).toBeVisible();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('filters by general answer origin', async () => {
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[{ id: 'base-growth', name: '增长知识库' }]}
        onCreateOrganizedNote={vi.fn()}
      />,
    );

    expect(screen.getByText('通用今天')).toBeVisible();
    expect(screen.getByText('1. 知识库卡片：带 markdown')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '筛选灵感卡片' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: '通用回答' }));

    expect(screen.getByText('通用今天')).toBeVisible();
    expect(screen.queryByText('1. 知识库卡片：带 markdown')).not.toBeInTheDocument();
  });
});

describe('InspirationCards manage mode', () => {
  it('enters manage mode with batch delete and import disabled until selection', async () => {
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[]}
        notes={[]}
        notebooks={[]}
        onDeleteCards={vi.fn()}
        onAddCardsAsNotes={vi.fn()}
        onAttachCardsToNote={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '管理' }));
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导入笔记' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '选择卡片：general-today' }));
    expect(screen.getByRole('button', { name: '删除' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '导入笔记' })).toBeEnabled();
  });

  it('calls onDeleteCards with selected ids and exits manage mode', async () => {
    const onDeleteCards = vi.fn();
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[]}
        notes={[]}
        notebooks={[]}
        onDeleteCards={onDeleteCards}
        onAddCardsAsNotes={vi.fn()}
        onAttachCardsToNote={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '管理' }));
    await userEvent.click(screen.getByRole('button', { name: '选择卡片：general-today' }));
    await userEvent.click(screen.getByRole('button', { name: '选择卡片：rag-kb' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(onDeleteCards).toHaveBeenCalledWith(['general-today', 'rag-kb']);
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '管理' })).toBeVisible();
  });

  it('imports via 新建笔记 submenu and keeps organize available after cancel', async () => {
    const onAddCardsAsNotes = vi.fn(async () => 2);
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[]}
        notes={[]}
        notebooks={[]}
        onDeleteCards={vi.fn()}
        onAddCardsAsNotes={onAddCardsAsNotes}
        onAttachCardsToNote={vi.fn()}
        onCreateOrganizedNote={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '管理' }));
    await userEvent.click(screen.getByRole('button', { name: '选择卡片：general-today' }));
    await userEvent.click(screen.getByRole('button', { name: '导入笔记' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '新建笔记' }));

    expect(onAddCardsAsNotes).toHaveBeenCalledWith(['general-today']);
    expect(screen.getByRole('button', { name: '整理为笔记' })).toBeVisible();
  });

  it('attaches selected cards to an existing note via picker', async () => {
    const onAttachCardsToNote = vi.fn(async () => {});
    render(
      <InspirationCards
        cards={cards}
        knowledgeBases={[]}
        notes={[{ id: 'n1', title: '增长笔记', notebookId: null }]}
        notebooks={[]}
        onDeleteCards={vi.fn()}
        onAddCardsAsNotes={vi.fn()}
        onAttachCardsToNote={onAttachCardsToNote}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '管理' }));
    await userEvent.click(screen.getByRole('button', { name: '选择卡片：rag-kb' }));
    await userEvent.click(screen.getByRole('button', { name: '导入笔记' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '加入已有笔记…' }));
    await userEvent.click(screen.getByRole('radio', { name: /增长笔记/ }));
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(onAttachCardsToNote).toHaveBeenCalledWith('n1', ['rag-kb']);
    expect(screen.getByRole('button', { name: '管理' })).toBeVisible();
  });
});
