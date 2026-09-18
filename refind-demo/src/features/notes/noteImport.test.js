import { describe, expect, it } from 'vitest';
import { parseImportedNoteFile } from './noteImport.js';

describe('noteImport', () => {
  it('uses markdown heading as title when present', () => {
    expect(parseImportedNoteFile('draft.md', '# 会员活动\n\n正文内容')).toMatchObject({
      title: '会员活动',
      content: { text: '正文内容' },
      notebookId: null,
    });
  });

  it('falls back to filename for plain text', () => {
    expect(parseImportedNoteFile('随手记.txt', '一段文字')).toMatchObject({
      title: '随手记',
      content: { text: '一段文字' },
      notebookId: null,
    });
  });
});
