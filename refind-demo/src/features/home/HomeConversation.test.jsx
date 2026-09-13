import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeConversation, HomeShareBar } from './HomeConversation.jsx';

afterEach(cleanup);

const messages = [{
  id: 1,
  question: '如何做内容增长？',
  mode: 'general',
  selectedBases: [],
  selectedTags: [],
}];

describe('HomeConversation share mode', () => {
  it('starts share from answer action and hides answer buttons', async () => {
    const onShareStart = vi.fn();
    render(
      <HomeConversation
        messages={messages}
        onShareStart={onShareStart}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '分享回答' }));
    expect(onShareStart).toHaveBeenCalledWith('1-answer');
  });

  it('lets users toggle bubbles while share mode is on', async () => {
    const onToggleBubble = vi.fn();
    render(
      <HomeConversation
        messages={messages}
        shareMode
        selectedBubbleIds={['1-answer']}
        onToggleBubble={onToggleBubble}
      />,
    );

    expect(screen.queryByRole('button', { name: '分享回答' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择提问：如何做内容增长？' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '选择回答' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '选择提问：如何做内容增长？' }));
    expect(onToggleBubble).toHaveBeenCalledWith('1-user');
  });
});

describe('HomeShareBar', () => {
  it('copies dialogue link and cancels', async () => {
    const onCopyLink = vi.fn();
    const onCancel = vi.fn();
    render(<HomeShareBar selectedCount={2} onCopyLink={onCopyLink} onCancel={onCancel} />);

    expect(screen.getByText('已选择 2 条气泡')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '复制对话链接' }));
    expect(onCopyLink).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
