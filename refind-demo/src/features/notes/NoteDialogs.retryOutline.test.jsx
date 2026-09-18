import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor.jsx';
import { RetryOutlineConfirmDialog } from './NoteDialogs.jsx';

afterEach(cleanup);

const noteWithBody = {
  id: 'n1',
  title: 't',
  inspirationCardIds: ['a', 'b'],
  materialThoughts: {},
  content: {
    text: '已有正文',
    sections: [{ text: '已有正文', cardId: 'a' }],
    outline: {
      version: 1,
      chapters: [{ id: 'ch1', title: '动机', cardIds: ['a', 'b'] }],
      unassignedCardIds: [],
    },
  },
};

function renderEditor(overrides = {}) {
  return render(
    <NoteEditor
      mode="inspiration"
      showMaterials
      note={noteWithBody}
      cards={[
        { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
        { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
      ]}
      {...overrides}
    />,
  );
}

describe('RetryOutlineConfirmDialog', () => {
  it('fires the close action for only updating the outline', async () => {
    const onClose = vi.fn();
    render(
      <RetryOutlineConfirmDialog onClose={onClose} onGenerate={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '仅更新结构' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes and generates when updating the outline and body', async () => {
    const onClose = vi.fn();
    const onGenerate = vi.fn();
    render(<RetryOutlineConfirmDialog onClose={onClose} onGenerate={onGenerate} />);

    await userEvent.click(screen.getByRole('button', { name: '更新并重新生成' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('NoteEditor retry outline confirmation', () => {
  it('opens confirmation after a successful retry when the body exists', async () => {
    const onRetryOutline = vi.fn().mockResolvedValue(undefined);
    renderEditor({ onRetryOutline });

    await userEvent.click(screen.getByRole('button', { name: '重试成章' }));

    expect(await screen.findByText('结构已更新，是否用新结构重新生成正文？')).toBeInTheDocument();
  });

  it('does not open confirmation when the body is empty', async () => {
    const onRetryOutline = vi.fn().mockResolvedValue(undefined);
    renderEditor({
      note: { ...noteWithBody, content: { text: '', sections: [], outline: noteWithBody.content.outline } },
      onRetryOutline,
    });

    await userEvent.click(screen.getByRole('button', { name: '重试成章' }));

    expect(screen.queryByText('结构已更新，是否用新结构重新生成正文？')).not.toBeInTheDocument();
  });

  it('generates only after confirming the retry dialog', async () => {
    const onRetryOutline = vi.fn().mockResolvedValue(undefined);
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    renderEditor({ onRetryOutline, onGenerate });

    await userEvent.click(screen.getByRole('button', { name: '重试成章' }));
    await userEvent.click(await screen.findByRole('button', { name: '更新并重新生成' }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('结构已更新，是否用新结构重新生成正文？')).not.toBeInTheDocument();
  });
});
