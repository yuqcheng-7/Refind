import { describe, expect, it } from 'vitest';
import { isJunkPrefetch } from './ingest.js';
import {
  prefetchZhihuViaBrowserApi,
  zhihuAnswerId,
  zhihuArticleId,
  zhihuQuestionId,
} from './zhihuBrowserPrefetch.js';

describe('isJunkPrefetch', () => {
  it('rejects Douyin captcha intermediate pages', () => {
    expect(isJunkPrefetch({
      platform: 'douyin',
      title: '验证码中间页',
      content_text: '验证码中间页',
    })).toBe(true);
  });

  it('keeps real Douyin captions', () => {
    expect(isJunkPrefetch({
      platform: 'douyin',
      title: '今天分享一个产品设计方法',
      content_text: '今天分享一个产品设计方法，从用户访谈到方案落地的完整路径。',
      caption_text: '今天分享一个产品设计方法，从用户访谈到方案落地的完整路径。',
    })).toBe(false);
  });

  it('rejects Zhihu marketing shells', () => {
    expect(isJunkPrefetch({
      platform: 'zhihu',
      title: '知乎',
      content_text: '中文互联网高质量的问答社区',
    })).toBe(true);
  });
});

describe('zhihuBrowserPrefetch', () => {
  it('parses article / question / answer ids', () => {
    expect(zhihuArticleId('https://zhuanlan.zhihu.com/p/12345')).toBe('12345');
    expect(zhihuQuestionId('https://www.zhihu.com/question/99')).toBe('99');
    expect(zhihuAnswerId('https://www.zhihu.com/question/99/answer/88')).toBe('88');
  });

  it('builds content from column article API JSON', async () => {
    const fetchJson = async () => ({
      text: JSON.stringify({
        title: '专栏标题',
        content: '<p>第一段正文，足够长以便验收。</p><p>第二段。</p>',
        excerpt: '摘要',
        author: { name: '作者甲' },
        url: 'https://zhuanlan.zhihu.com/p/1',
      }),
    });
    const result = await prefetchZhihuViaBrowserApi('https://zhuanlan.zhihu.com/p/1', fetchJson);
    expect(result.platform).toBe('zhihu');
    expect(result.title).toBe('专栏标题');
    expect(result.author_name).toBe('作者甲');
    expect(result.content_text).toMatch(/第一段正文/);
  });
});
