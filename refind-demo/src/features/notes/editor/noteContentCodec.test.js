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

  it('builds html from heading sections with 一、二、三', () => {
    const html = htmlFromNoteContent({
      sections: [
        { type: 'paragraph', text: '开场' },
        { type: 'heading', level: 2, text: '一、核心框架' },
        { type: 'paragraph', text: '展开' },
        { type: 'heading', level: 2, text: '二、实践路径' },
      ],
    });
    expect(html).toContain('<h2>一、核心框架</h2>');
    expect(html).toContain('<h2>二、实践路径</h2>');
  });

  it('builds html from bullet and ordered list sections', () => {
    const html = htmlFromNoteContent({
      sections: [
        { type: 'paragraph', text: '开场' },
        { type: 'bullet_list', items: ['甲', '乙'] },
        { type: 'ordered_list', items: ['一步', '二步'] },
      ],
    });
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li><p data-body="body1">甲</p></li>');
    expect(html).toContain('<li><p data-body="body1">一步</p></li>');
  });

  it('embeds interactive citation markers for RAG sections', () => {
    const html = htmlFromNoteContent({
      sections: [
        {
          type: 'paragraph',
          text: '缩短首次价值时间。',
          cardId: 'rag-1',
          citationIndex: 1,
          citationLabel: '小红书增长策略',
        },
      ],
    });
    expect(html).toContain('data-citation="1"');
    expect(html).toContain('data-card-id="rag-1"');
    expect(html).toContain('data-label="小红书增长策略"');
    expect(html).toContain('[1]');
  });

  it('normalizes pasted HTML with odd font-size into plain markup', () => {
    const html = normalizePastedHtml('<p style="font-size:19px"><span class="x">外部</span></p>');
    expect(html).not.toMatch(/font-size/i);
    expect(html).toContain('外部');
    expect(html).toContain('data-body="body1"');
  });
});
