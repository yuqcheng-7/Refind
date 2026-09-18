import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KbConversation } from './KbConversation.jsx';

afterEach(cleanup);

const messages = [{
  id: 9,
  question: '你好',
  answer: '这是知识库 API 返回的回答[1]。',
  mode: 'rag',
  selectedBases: ['默认知识库'],
  selectedTags: [],
  citations: [{ order: 1, label: '真实资料', materialId: 'material-1', excerpt: '引用摘录' }],
}];

describe('KbConversation share mode', () => {
  it('starts share from answer action', async () => {
    const onShareStart = vi.fn();
    render(<KbConversation messages={messages} onShareStart={onShareStart} />);

    await userEvent.click(screen.getByRole('button', { name: '分享回答' }));
    expect(onShareStart).toHaveBeenCalledWith('kb-9-answer');
  });

  it('hides answer actions and allows bubble toggle in share mode', async () => {
    const onToggleBubble = vi.fn();
    render(
      <KbConversation
        messages={messages}
        selectMode="share"
        selectedBubbleIds={['kb-9-answer']}
        onToggleBubble={onToggleBubble}
      />,
    );

    expect(screen.queryByRole('button', { name: '分享回答' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '选择提问：你好' }));
    expect(onToggleBubble).toHaveBeenCalledWith('kb-9-user');
  });
});

describe('KbConversation edit resend', () => {
  it('edits a user bubble and resends the revised question', async () => {
    const onResend = vi.fn();
    render(<KbConversation messages={messages} onResend={onResend} />);

    await userEvent.click(screen.getByRole('button', { name: '编辑提问' }));
    const editor = screen.getByRole('textbox', { name: '编辑提问内容' });
    await userEvent.clear(editor);
    await userEvent.type(editor, '改写后的提问');
    await userEvent.click(screen.getByRole('button', { name: '重新发送' }));

    expect(onResend).toHaveBeenCalledWith({
      messageId: 9,
      prompt: '改写后的提问',
      mode: 'rag',
      selectedBases: ['默认知识库'],
      selectedTags: [],
      online: false,
    });
  });

  it('allows editing the user bubble while the answer is still generating', async () => {
    const onResend = vi.fn();
    render(
      <KbConversation
        messages={[{
          id: 'pending-kb-1',
          question: '正在生成中的问题',
          mode: 'rag',
          selectedBases: ['默认知识库'],
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
      messageId: 'pending-kb-1',
      prompt: '改一下再发',
    }));
  });

  it('hides edit control while sharing', () => {
    render(<KbConversation messages={messages} selectMode="share" onResend={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '编辑提问' })).not.toBeInTheDocument();
  });
});
