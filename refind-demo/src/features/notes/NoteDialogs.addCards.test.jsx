import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddInspirationCardsDialog } from './NoteDialogs.jsx';

afterEach(cleanup);

const cards = [
  {
    id: 'c1',
    sourceLabel: '通用回答',
    answerMode: 'general',
    contentSnapshot: '第一张卡片摘录内容足够长用来搜索',
    questionSnapshot: '问题一',
  },
  {
    id: 'c2',
    sourceLabel: '知识库回答',
    answerMode: 'rag',
    contentSnapshot: '第二张关于会员活动',
    questionSnapshot: '问题二',
  },
];

describe('AddInspirationCardsDialog', () => {
  it('multi-selects cards and confirms with ids', async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<AddInspirationCardsDialog cards={cards} onConfirm={onConfirm} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '添加灵感卡片' })).toBeVisible();
    await userEvent.click(screen.getByRole('checkbox', { name: /第一张卡片/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /第二张关于会员/ }));
    await userEvent.click(screen.getByRole('button', { name: '添加 2 张' }));

    expect(onConfirm).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('filters the list by search query', async () => {
    render(<AddInspirationCardsDialog cards={cards} onConfirm={vi.fn()} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('搜索灵感卡片'), '会员');
    expect(screen.getByRole('checkbox', { name: /第二张关于会员/ })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /第一张卡片/ })).not.toBeInTheDocument();
  });
});
