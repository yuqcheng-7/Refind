import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeHistoryCard } from './HomeHistoryCard.jsx';

afterEach(cleanup);

const conversations = [
  { id: 'c1', title: '训练营介绍', updatedAt: new Date().toISOString() },
];

describe('HomeHistoryCard', () => {
  it('opens rename and delete actions from context menu', async () => {
    const onRenameConversation = vi.fn();
    const onDeleteConversation = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <HomeHistoryCard
        conversations={conversations}
        onRenameConversation={onRenameConversation}
        onDeleteConversation={onDeleteConversation}
      />,
    );

    fireEvent.contextMenu(screen.getByText('训练营介绍').closest('button'));
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeVisible();
    expect(screen.getByRole('menu', { name: '会话操作' }).textContent).not.toContain('训练营介绍');

    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = screen.getByLabelText('会话名称');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, '新标题{Enter}');
    expect(onRenameConversation).toHaveBeenCalledWith('c1', '新标题');
    expect(screen.queryByRole('heading', { name: '重命名会话' })).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('训练营介绍').closest('button'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(onDeleteConversation).toHaveBeenCalledWith('c1');
    confirm.mockRestore();
  });
});
