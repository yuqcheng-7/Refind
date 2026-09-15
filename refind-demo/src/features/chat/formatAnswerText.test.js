import { describe, expect, it } from 'vitest';
import {
  citationByOrder,
  normalizeAnswerText,
  splitAnswerBlocks,
  stripMarkdownForReading,
  tokenizeInline,
} from './formatAnswerText.js';

describe('stripMarkdownForReading', () => {
  it('removes broken bold markers for conversational reading', () => {
    const input = 'RAG 流程如下：\n\n**\n1. 准备阶段**\n**\n2. 检索阶段**';
    const out = stripMarkdownForReading(input);
    expect(out).not.toContain('*');
    expect(out).toContain('1. 准备阶段');
    expect(out).toContain('2. 检索阶段');
  });
});

describe('normalizeAnswerText', () => {
  it('joins orphaned list markers onto the next line', () => {
    const input = '简介如下：\n1.\n收藏知识：上传文件\n2.\n管理知识：建文件夹';
    const out = normalizeAnswerText(input);
    expect(out).toContain('1. 收藏知识：上传文件');
    expect(out).toContain('2. 管理知识：建文件夹');
    expect(out).not.toMatch(/^1\.\s*$/m);
  });

  it('inserts breaks before jammed numbered sections', () => {
    const input = '根据资料[1]简介如下： 1. **收藏知识** 说明A 2. **管理知识** 说明B';
    const out = normalizeAnswerText(input);
    expect(out).toContain('\n\n1. **收藏知识**');
    expect(out).toContain('\n\n2. **管理知识**');
  });

  it('conversational mode strips markdown before splitting', () => {
    const out = normalizeAnswerText('你好，**朋友**。\n**\n1. 第一步**', { conversational: true });
    expect(out).not.toContain('*');
    expect(out).toContain('朋友');
    expect(out).toContain('1. 第一步');
  });
});

describe('tokenizeInline', () => {
  it('splits bold and citation markers', () => {
    expect(tokenizeInline('见**重点**结论[1]。')).toEqual([
      { type: 'text', value: '见' },
      { type: 'bold', value: '重点' },
      { type: 'text', value: '结论' },
      { type: 'citation', order: 1 },
      { type: 'text', value: '。' },
    ]);
  });
});

describe('splitAnswerBlocks', () => {
  it('builds list blocks with content on the same item', () => {
    const blocks = splitAnswerBlocks('前言[1]\n\n1.\n收藏知识 A\n2.\n管理知识 B');
    expect(blocks[0]).toEqual({ type: 'paragraph', text: '前言[1]' });
    expect(blocks[1]).toEqual({
      type: 'list',
      items: ['收藏知识 A', '管理知识 B'],
    });
  });
});

describe('citationByOrder', () => {
  it('finds citation metadata by order', () => {
    expect(citationByOrder([{ order: 2, label: '资料B' }], 2)?.label).toBe('资料B');
    expect(citationByOrder([{ order: 2, label: '资料B' }], 1)).toBeNull();
  });
});
