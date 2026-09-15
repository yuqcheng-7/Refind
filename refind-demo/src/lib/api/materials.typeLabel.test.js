import { describe, expect, it } from 'vitest';
import { formatMaterialTitle, formatMaterialTypeLabel, inferPlatformFromUrl, mapMaterial } from './materials.js';

describe('inferPlatformFromUrl', () => {
  it('detects mainstream platforms from hostnames', () => {
    expect(inferPlatformFromUrl('https://www.xiaohongshu.com/explore/abc')).toBe('xhs');
    expect(inferPlatformFromUrl('https://www.douyin.com/video/123')).toBe('douyin');
    expect(inferPlatformFromUrl('https://v.douyin.com/AbCdEf/')).toBe('douyin');
    expect(inferPlatformFromUrl('https://www.zhihu.com/question/1')).toBe('zhihu');
    expect(inferPlatformFromUrl('https://www.bilibili.com/video/BV1')).toBe('bilibili');
    expect(inferPlatformFromUrl('https://b23.tv/abc')).toBe('bilibili');
    expect(inferPlatformFromUrl('https://mp.weixin.qq.com/s/xyz')).toBe('wechat_mp');
    expect(inferPlatformFromUrl('https://example.com/post')).toBe('web');
  });
});

describe('formatMaterialTypeLabel', () => {
  it('shows platform for mainstream link sources and 链接 otherwise', () => {
    expect(formatMaterialTypeLabel({ input_type: 'link', platform_code: 'xhs' })).toBe('小红书');
    expect(formatMaterialTypeLabel({ input_type: 'link', platform_code: 'web' })).toBe('链接');
    expect(formatMaterialTypeLabel({ input_type: 'link', platform_code: 'other' })).toBe('链接');
  });

  it('shows concrete file types for uploaded documents', () => {
    expect(formatMaterialTypeLabel({ input_type: 'pdf', platform_code: 'web' })).toBe('PDF');
    expect(formatMaterialTypeLabel({ input_type: 'docx', platform_code: 'web' })).toBe('Word');
    expect(formatMaterialTypeLabel({ input_type: 'pptx', platform_code: 'web' })).toBe('PPT');
    expect(formatMaterialTypeLabel({ input_type: 'xlsx', platform_code: 'web' })).toBe('Excel');
  });
});

describe('mapMaterial', () => {
  it('omits default 待整理 tag and maps file type label', () => {
    expect(mapMaterial({
      id: 'm1',
      knowledge_base_id: 'kb1',
      input_type: 'pdf',
      platform_code: 'web',
      title: '演讲稿.pdf',
      created_at: '2026-09-14T00:00:00Z',
      status: 'processing',
      material_tag_relations: [],
    })).toMatchObject({
      source: 'PDF',
      tag: '',
      statusLabel: '处理中',
    });
  });

  it('never displays bare http URLs as link titles', () => {
    expect(formatMaterialTitle({
      input_type: 'link',
      platform_code: 'bilibili',
      title: 'https://www.bilibili.com/video/BV1GJ411x7h7',
      source_url: 'https://www.bilibili.com/video/BV1GJ411x7h7',
    })).toBe('B 站视频 BV1GJ411x7h7');

    expect(mapMaterial({
      id: 'm2',
      knowledge_base_id: 'kb1',
      input_type: 'link',
      platform_code: 'zhihu',
      title: null,
      source_url: 'https://www.zhihu.com/question/19550225',
      created_at: '2026-09-14T00:00:00Z',
      status: 'ready',
      material_tag_relations: [],
    }).title).toBe('知乎 · zhihu.com');
  });
});
