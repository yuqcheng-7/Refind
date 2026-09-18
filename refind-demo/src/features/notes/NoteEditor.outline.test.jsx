import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteEditor } from './NoteEditor.jsx';

afterEach(cleanup);

function outlineNote(overrides = {}) {
  return {
    id: 'n1',
    title: 't',
    inspirationCardIds: ['a', 'b', 'c'],
    materialThoughts: {},
    content: {
      text: 'body',
      sections: [{ text: 'section', cardId: 'a' }],
      outline: {
        version: 1,
        chapters: [
          { id: 'ch1', title: '动机', cardIds: ['a', 'b'] },
          { id: 'ch2', title: '方案', cardIds: ['c'] },
        ],
        unassignedCardIds: [],
      },
    },
    ...overrides,
  };
}

function renderOutlineEditor(props = {}) {
  const onChange = props.onChange || vi.fn();
  const onRetryOutline = props.onRetryOutline || vi.fn();
  render(
    <NoteEditor
      mode="inspiration"
      showMaterials
      note={outlineNote(props.note)}
      cards={[
        { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
        { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
        { id: 'c', contentSnapshot: 'C', answerMode: 'general' },
      ]}
      onChange={onChange}
      onRetryOutline={onRetryOutline}
      {...props}
    />,
  );
  return onChange;
}

describe('NoteEditor materials outline', () => {
  it('auto-outlines when entering inspiration edit with ≥2 cards and no outline', async () => {
    const onOutline = vi.fn().mockResolvedValue(undefined);
    render(
      <NoteEditor
        mode="inspiration"
        showMaterials
        note={outlineNote({ content: { text: '', sections: [] } })}
        cards={[
          { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
          { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
        ]}
        onOutline={onOutline}
      />,
    );

    await waitFor(() => expect(onOutline).toHaveBeenCalledTimes(1));
  });

  it('does not auto-outline when outline already saved', async () => {
    const onOutline = vi.fn();
    render(
      <NoteEditor
        mode="inspiration"
        showMaterials
        note={outlineNote()}
        cards={[
          { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
          { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
        ]}
        onOutline={onOutline}
      />,
    );

    await waitFor(() => expect(onOutline).not.toHaveBeenCalled());
  });

  it('shows a retry action when auto-outline fails', async () => {
    const onOutline = vi.fn().mockRejectedValue(new Error('network'));
    const onRetryOutline = vi.fn();
    render(
      <NoteEditor
        mode="inspiration"
        showMaterials
        note={outlineNote({ content: { text: '', sections: [] } })}
        cards={[
          { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
          { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
        ]}
        onOutline={onOutline}
        onRetryOutline={onRetryOutline}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('成章失败，可重试')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '重试成章' })).toBeEnabled();
    });
  });

  it('renders chapter titles and parks unassigned cards', () => {
    render(
      <NoteEditor
        mode="inspiration"
        showMaterials
        note={{
          id: 'n1',
          title: 't',
          inspirationCardIds: ['a', 'b', 'c'],
          materialThoughts: {},
          content: {
            text: '',
            sections: [],
            outline: {
              version: 1,
              chapters: [{ id: 'ch1', title: '动机', cardIds: ['a'] }],
              unassignedCardIds: ['b', 'c'],
            },
          },
        }}
        cards={[
          { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
          { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
          { id: 'c', contentSnapshot: 'C', answerMode: 'general' },
        ]}
      />,
    );
    expect(screen.getByDisplayValue('动机')).toBeInTheDocument();
    expect(screen.getByText('未归章')).toBeInTheDocument();
  });

  it('renames a chapter and updates the outline through onChange', () => {
    const onChange = renderOutlineEditor();

    fireEvent.change(screen.getByDisplayValue('动机'), { target: { value: '背景' } });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      content: expect.objectContaining({
        outline: expect.objectContaining({
          chapters: expect.arrayContaining([
            expect.objectContaining({ id: 'ch1', title: '背景', cardIds: ['a', 'b'] }),
          ]),
        }),
      }),
    }));
  });

  it('removes a card from materials and outline without changing body sections', async () => {
    const onChange = renderOutlineEditor();

    await userEvent.click(screen.getByRole('button', { name: '移除 b' }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inspirationCardIds: ['a', 'c'],
      content: expect.objectContaining({
        text: 'body',
        sections: [{ text: 'section', cardId: 'a' }],
        outline: expect.objectContaining({
          chapters: expect.arrayContaining([
            expect.objectContaining({ id: 'ch1', cardIds: ['a'] }),
          ]),
          unassignedCardIds: [],
        }),
      }),
    }));
  });

  it('disables outline mutations while retry outline is pending', async () => {
    let resolveRetry;
    const onRetryOutline = vi.fn(() => new Promise((resolve) => {
      resolveRetry = resolve;
    }));
    renderOutlineEditor({ onRetryOutline });

    await userEvent.click(screen.getByRole('button', { name: '重试成章' }));

    await waitFor(() => {
      expect(screen.getByText('成章中…')).toBeInTheDocument();
      expect(screen.getByDisplayValue('动机')).toBeDisabled();
      expect(screen.getByRole('button', { name: '重试成章' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '移除 b' })).toBeDisabled();
    });

    resolveRetry();
    await waitFor(() => {
      expect(screen.queryByText('成章中…')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('动机')).not.toBeDisabled();
      expect(screen.getByRole('button', { name: '重试成章' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: '移除 b' })).not.toBeDisabled();
    });
  });

  it('disables outline mutations while generating', async () => {
    let resolveGenerate;
    const onGenerate = vi.fn(() => new Promise((resolve) => {
      resolveGenerate = resolve;
    }));
    renderOutlineEditor({ onGenerate });

    await userEvent.click(screen.getByRole('button', { name: '生成笔记' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled());

    expect(screen.getByDisplayValue('动机')).toBeDisabled();
    expect(screen.getByRole('button', { name: '重试成章' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '移除 b' })).toBeDisabled();

    resolveGenerate();
  });

  it('keeps inspiration card ids in flattened outline order after reorder', async () => {
    const onChange = renderOutlineEditor();

    await userEvent.click(screen.getByRole('button', { name: '下移 a' }));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      inspirationCardIds: ['b', 'a', 'c'],
      content: expect.objectContaining({
        outline: expect.objectContaining({
          chapters: expect.arrayContaining([
            expect.objectContaining({ id: 'ch1', cardIds: ['b', 'a'] }),
          ]),
        }),
      }),
    }));
  });
});
