import { describe, expect, it } from 'vitest';
import { noteToolbarStyleLabels } from './NoteEditorToolbar.jsx';

describe('NoteEditorToolbar', () => {
  it('exposes style menu labels from product copy', () => {
    expect(noteToolbarStyleLabels()).toEqual([
      '标题1',
      '标题2',
      '标题3',
      '正文（默认）',
      '辅助正文',
      '小字备注',
    ]);
  });
});
