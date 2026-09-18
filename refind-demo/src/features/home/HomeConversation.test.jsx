import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeConversation } from './HomeConversation.jsx';

afterEach(cleanup);

const messages = [{
  id: 'turn-1',
  question: '原来的问题',
  answer: '这是回答',
  mode: 'general',
  selectedBases: [],
  selectedTags: [],
  citations: [],
}];

describe('HomeConversation', () => {
  it('shows empty prompt for a new session without messages', () => {
    render(
      <HomeConversation
        messages={[]}
        emptyPrompt="有什么想聊的？直接提问，或在输入框里选择知识库。"
      />,
    );
    expect(screen.getByText(/在输入框里选择知识库/)).toBeVisible();
  });

  it('edits a user bubble and resends the revised question', async () => {
    const onResend = vi.fn();
    render(<HomeConversation messages={messages} onResend={onResend} />);

    await userEvent.click(screen.getByRole('button', { name: '编辑提问' }));
    const editor = screen.getByRole('textbox', { name: '编辑提问内容' });
    await userEvent.clear(editor);
    await userEvent.type(editor, '修改后的问题');
    await userEvent.click(screen.getByRole('button', { name: '重新发送' }));

    expect(onResend).toHaveBeenCalledWith({
      messageId: 'turn-1',
      prompt: '修改后的问题',
      mode: 'general',
      selectedBases: [],
      selectedTags: [],
      online: false,
    });
  });

  it('allows editing the user bubble while the answer is still generating', async () => {
    const onResend = vi.fn();
    render(
      <HomeConversation
        messages={[{
          id: 'pending-home-1',
          question: '正在生成中的问题',
          mode: 'general',
          selectedBases: [],
          selectedTags: [],
          citations: [],
          pending: true,
        }]}
        onResend={onResend}
      />,
    );

    const edit = screen.getByRole('button', { name: '编辑提问' });
    expect(edit).toBeEnabled();
    await userEvent.click(edit);
    const editor = screen.getByRole('textbox', { name: '编辑提问内容' });
    await userEvent.clear(editor);
    await userEvent.type(editor, '改一下再发');
    await userEvent.click(screen.getByRole('button', { name: '重新发送' }));

    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'pending-home-1',
      prompt: '改一下再发',
    }));
  });

  it('hides edit control while sharing', () => {
    render(<HomeConversation messages={messages} selectMode="share" onResend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '编辑提问' })).not.toBeInTheDocument();
  });

  it('enters delete selection from the answer menu and can select user or answer bubbles', async () => {
    const onDeleteStart = vi.fn();
    const onToggleBubble = vi.fn();
    const { rerender } = render(
      <HomeConversation messages={messages} onDeleteStart={onDeleteStart} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '更多操作' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(onDeleteStart).toHaveBeenCalledWith('turn-1-answer');

    rerender(
      <HomeConversation
        messages={messages}
        selectMode="delete"
        selectedBubbleIds={['turn-1-answer']}
        onToggleBubble={onToggleBubble}
        onDeleteStart={onDeleteStart}
      />,
    );

    expect(screen.queryByRole('button', { name: '更多操作' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '选择提问：原来的问题' }));
    expect(onToggleBubble).toHaveBeenCalledWith('turn-1-user');
    await userEvent.click(screen.getByRole('button', { name: '选择回答' }));
    expect(onToggleBubble).toHaveBeenCalledWith('turn-1-answer');
  });

  it('opens web source urls from general answers', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <HomeConversation
        messages={[{
          ...messages[0],
          answer: '根据最新消息…',
          webSources: [{ order: 1, title: '气象台', url: 'https://example.com/weather' }],
        }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '来源 1：气象台' }));
    expect(open).toHaveBeenCalledWith('https://example.com/weather', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
