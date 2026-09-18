import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoteEditor } from './NoteEditor.jsx';

describe('NoteEditor materials outline', () => {
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
});
