import { describe, expect, it } from 'vitest';
import { noteMarkdown, notePlainText, safeNoteFilename } from './noteExport.js';

describe('noteExport', () => {
  it('builds plain text with title and body', () => {
    expect(notePlainText({ title: '标题', content: { text: '正文' } })).toBe('标题\n\n正文');
  });

  it('builds markdown with heading', () => {
    expect(noteMarkdown({ title: '标题', content: { text: '正文' } })).toBe('# 标题\n\n正文');
  });

  it('sanitizes download filename', () => {
    expect(safeNoteFilename('a/b:c', 'md')).toBe('a_b_c.md');
  });
});
