import { describe, expect, it } from 'vitest';
import { normalizeSourceUrl } from './normalizeSourceUrl.js';

describe('normalizeSourceUrl', () => {
  it('rewrites Douyin jingxuan modal_id to /video/{id}', () => {
    const input = 'https://www.douyin.com/jingxuan/search/AI产品经理入门?modal_id=7639651023493156130&type=general';
    expect(normalizeSourceUrl(input)).toBe('https://www.douyin.com/video/7639651023493156130');
  });

  it('keeps plain Douyin video URLs', () => {
    expect(normalizeSourceUrl('https://www.douyin.com/video/12345'))
      .toBe('https://www.douyin.com/video/12345');
  });

  it('passes through WeChat article URLs', () => {
    const url = 'https://mp.weixin.qq.com/s/qA_r60ErGgmCy3LYlj4RYg';
    expect(normalizeSourceUrl(url)).toBe(url);
  });
});
