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
        shareMode
        selectedBubbleIds={['kb-9-answer']}
        onToggleBubble={onToggleBubble}
      />,
    );

    expect(screen.queryByRole('button', { name: '分享回答' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '选择提问：你好' }));
    expect(onToggleBubble).toHaveBeenCalledWith('kb-9-user');
  });
});
