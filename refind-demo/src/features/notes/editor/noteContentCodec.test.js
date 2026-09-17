import { describe, expect, it } from 'vitest';
import {
  htmlFromNoteContent,
  noteContentFromEditor,
  normalizePastedHtml,
} from './noteContentCodec.js';

describe('noteContentCodec', () => {
  it('builds html from plain text content', () => {
    const html = htmlFromNoteContent({ text: '第一段\n第二段' });
    expect(html).toContain('data-body="body1"');
    expect(html).toContain('第一段');
    expect(html).toContain('第二段');
  });

  it('round-trips editor payload into note content shape', () => {
    const payload = noteContentFromEditor({
      html: '<p data-body="body1">你好</p>',
      text: '你好',
      json: { type: 'doc' },
    });
    expect(payload.html).toContain('你好');
    expect(payload.text).toBe('你好');
    expect(payload.json).toEqual({ type: 'doc' });
  });

  it('normalizes pasted HTML with odd font-size into plain markup', () => {
    const html = normalizePastedHtml('<p style="font-size:19px"><span class="x">外部</span></p>');
    expect(html).not.toMatch(/font-size/i);
    expect(html).toContain('外部');
    expect(html).toContain('data-body="body1"');
  });
});
