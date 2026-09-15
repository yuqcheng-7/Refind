import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeConversation } from './HomeConversation.jsx';

afterEach(cleanup);

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
});
