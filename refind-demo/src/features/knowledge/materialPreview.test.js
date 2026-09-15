import { describe, expect, it } from 'vitest';
import {
  getBilibiliEmbedUrl,
  getPreviewCaption,
  getPreviewOriginLabel,
  getPreviewSummary,
  getPreviewTags,
  getPreviewTypeLabel,
  isVideoMaterial,
  splitReadableParagraphs,
} from './materialPreview.js';

describe('materialPreview helpers', () => {
  it('splits body text into readable paragraphs', () => {
    expect(splitReadableParagraphs('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。']);
  });

  it('detects video materials and type labels', () => {
    const bilibili = {
      kind: 'link',
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      source: 'B 站',
    };
    expect(isVideoMaterial(bilibili)).toBe(true);
    expect(getPreviewTypeLabel(bilibili)).toBe('B 站视频');
    expect(getPreviewOriginLabel(bilibili)).toBe('bilibili.com');
    expect(getBilibiliEmbedUrl(bilibili.url)).toContain('bvid=BV1xx411c7mD');
  });

  it('uses local upload origin for files and keeps tags list', () => {
    const file = { kind: 'file', typeLabel: 'PDF', tag: '用户研究', tags: ['用户研究', '教育'] };
    expect(getPreviewOriginLabel(file)).toBe('本地上传');
    expect(getPreviewTypeLabel(file)).toBe('PDF');
    expect(getPreviewTags(file)).toEqual(['用户研究', '教育']);
  });

  it('avoids weak BV placeholders as AI summary or caption', () => {
    const material = {
      title: 'B站视频 BV1GJ411x7h7',
      summary: 'B站视频 BV1GJ411x7h7',
      caption: 'B站视频 BV1GJ411x7h7',
      body: '已收藏 B 站视频 BV1GJ411x7h7。源站暂未返回简介，可先播放或打开原站。',
      status: 'ready',
    };
    expect(getPreviewSummary(material)).toMatch(/暂无可用 AI 摘要|正文更充足/);
    expect(getPreviewCaption(material)).toBe('');
  });
});
