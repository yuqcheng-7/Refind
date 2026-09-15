import { describe, expect, it } from 'vitest';
import { extractUrlFromPaste, splitPasteLink } from './extractUrlFromPaste.js';

describe('extractUrlFromPaste', () => {
  it('returns a bare URL unchanged', () => {
    expect(extractUrlFromPaste('https://www.bilibili.com/video/BV1GJ411x7h7')).toBe(
      'https://www.bilibili.com/video/BV1GJ411x7h7',
    );
  });

  it('extracts URL from Douyin / Bilibili / Zhihu share text', () => {
    expect(
      extractUrlFromPaste('7.xx 复制打开抖音，看看【测试】 https://v.douyin.com/AbCdEf/ 你好'),
    ).toBe('https://v.douyin.com/AbCdEf/');

    expect(
      extractUrlFromPaste('【MV】Never Gonna Give You Up https://b23.tv/xxxxx 来自B站'),
    ).toBe('https://b23.tv/xxxxx');

    expect(
      extractUrlFromPaste('这个问题值得一看 https://www.zhihu.com/question/19550225'),
    ).toBe('https://www.zhihu.com/question/19550225');
  });
});

describe('splitPasteLink', () => {
  it('keeps share text as title and isolates URL', () => {
    expect(splitPasteLink('看看这个 https://www.zhihu.com/question/1 很有意思')).toEqual({
      url: 'https://www.zhihu.com/question/1',
      title: '看看这个 很有意思',
    });
  });

  it('does not use bare URL as title', () => {
    expect(splitPasteLink('https://www.bilibili.com/video/BV1GJ411x7h7')).toEqual({
      url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
      title: '',
    });
  });
});
