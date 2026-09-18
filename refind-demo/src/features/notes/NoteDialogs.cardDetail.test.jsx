import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardDetailDialog } from './NoteDialogs.jsx';

afterEach(cleanup);

const card = {
  id: 'card-1',
  sourceLabel: '知识库回答',
  answerMode: 'rag',
  sourceKnowledgeBaseIds: ['base-growth'],
  questionSnapshot: 'AI产品经理技术应该理解到什么程度？',
  contentSnapshot: '基础层要懂[1]。进阶关注评测[3]，并理解工程边界[4]。',
  citation: { label: '资料一', order: 1, materialId: 'mat-1' },
  citationSnapshot: [
    { label: '资料一', order: 1, materialId: 'mat-1' },
    { label: '资料二', order: 2, materialId: 'mat-2' },
    { label: '资料三', order: 3, materialId: 'mat-3' },
    { label: '资料四', order: 4, materialId: 'mat-4' },
  ],
};

describe('CardDetailDialog', () => {
  it('lists every cited material and opens preview on click', async () => {
    const onOpenMaterial = vi.fn();
    render(
      <CardDetailDialog
        card={card}
        knowledgeBases={[{ id: 'base-growth', name: '增长知识库' }]}
        onAddToNote={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        onOpenMaterial={onOpenMaterial}
      />,
    );

    expect(screen.getByText('增长知识库')).toBeVisible();
    const sources = screen.getByLabelText('来源资料');
    expect(sources).toHaveTextContent('资料一');
    expect(sources).toHaveTextContent('资料三');
    expect(sources).toHaveTextContent('资料四');
    expect(sources).not.toHaveTextContent('资料二');

    await userEvent.click(within(sources).getByRole('button', { name: /资料三/ }));
    expect(onOpenMaterial).toHaveBeenCalledWith('mat-3');
  });

  it('puts create/attach note actions inside the more menu and keeps delete there', async () => {
    const onAddToNote = vi.fn();
    const onAttachCardsToNote = vi.fn(async () => {});
    const onDelete = vi.fn();
    render(
      <CardDetailDialog
        card={card}
        notes={[{ id: 'n1', title: '增长笔记', notebookId: null }]}
        notebooks={[]}
        onAddToNote={onAddToNote}
        onAttachCardsToNote={onAttachCardsToNote}
        onDelete={onDelete}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '加入笔记' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '更多卡片操作' }));
    expect(screen.getByRole('menuitem', { name: '新建笔记' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '加入已有笔记…' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '删除卡片' })).toBeVisible();

    await userEvent.click(screen.getByRole('menuitem', { name: '新建笔记' }));
    expect(onAddToNote).toHaveBeenCalledWith(card);
  });
});
