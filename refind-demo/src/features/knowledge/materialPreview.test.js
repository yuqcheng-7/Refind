import { describe, expect, it } from 'vitest';
import {
  buildReadableBlocks,
  getBilibiliEmbedUrl,
  getPreviewCaption,
  getPreviewOriginLabel,
  getPreviewSummary,
  getPreviewTags,
  getPreviewTypeLabel,
  isPreviewHeading,
  isVideoMaterial,
  splitPreviewBodyAndImageAppendix,
  splitReadableParagraphs,
} from './materialPreview.js';

describe('materialPreview helpers', () => {
  it('splits body text into readable paragraphs', () => {
    expect(splitReadableParagraphs('第一段。\n\n第二段。')).toEqual(['第一段。', '第二段。']);
  });

  it('only treats numbered outline lines as headings', () => {
    expect(isPreviewHeading('一、免费工具怎么选')).toBe(true);
    expect(isPreviewHeading('1. 安装步骤')).toBe(true);
    expect(isPreviewHeading('（一）项目背景')).toBe(true);
    expect(isPreviewHeading('(二) 技术实现')).toBe(true);
    expect(isPreviewHeading('打开很快')).toBe(false);
    expect(isPreviewHeading('2 项目技术栈')).toBe(false); // no delimiter → not H1
    expect(isPreviewHeading('• 先看打开速度')).toBe(false);
    expect(isPreviewHeading('（1）具体步骤')).toBe(false);
  });

  it('splits only on blank lines and keeps long sentences intact', () => {
    const wall = '在推荐工具前，先说清楚什么叫「够用」的修图体验：打开快、导出不加水印。优先看是否支持中文界面。';
    expect(splitReadableParagraphs(wall)).toEqual([wall]);
    expect(splitReadableParagraphs(`${wall}\n\n第二段内容。`)).toEqual([wall, '第二段内容。']);
  });

  it('splits scraped single-newline paragraphs without hard-cutting sentences', () => {
    expect(splitReadableParagraphs('第一段结束。\n第二段开始。\n第三段继续。')).toEqual([
      '第一段结束。',
      '第二段开始。',
      '第三段继续。',
    ]);
    const wall = '在推荐工具前，先说清楚什么叫「够用」的修图体验：打开快、导出不加水印。优先看是否支持中文界面。';
    expect(splitReadableParagraphs(wall)).toEqual([wall]);
  });

  it('splits parenthetical Chinese ordinals and bullet list lines', () => {
    expect(splitReadableParagraphs('前言说明结束。（一）项目背景\n联想提出天禧战略。\n（二）技术路线\n基于开源模型。')).toEqual([
      '前言说明结束。',
      '（一）项目背景',
      '联想提出天禧战略。',
      '（二）技术路线',
      '基于开源模型。',
    ]);
    expect(splitReadableParagraphs('选择标准如下：\n• 打开要快\n• 导出不加水印\n- 支持中文界面')).toEqual([
      '选择标准如下：',
      '• 打开要快',
      '• 导出不加水印',
      '- 支持中文界面',
    ]);
    expect(splitReadableParagraphs('步骤说明。\n（1）准备资料\n（2）开始解析\n1）确认结果')).toEqual([
      '步骤说明。',
      '（1）准备资料',
      '（2）开始解析',
      '1）确认结果',
    ]);
  });

  it('detects outline headings and builds readable blocks', () => {
    expect(isPreviewHeading('1. 项目背景')).toBe(true);
    expect(isPreviewHeading('二、每周详细学习与任务安排')).toBe(true);
    const blocks = buildReadableBlocks('1. 项目背景\n\n联想提出天禧AI生态战略。\n\n2. 项目技术栈\n\n基于开源模型与RAG框架。');
    expect(blocks[0]).toEqual({ type: 'heading', text: '1. 项目背景' });
    expect(blocks[1].type).toBe('paragraph');
    expect(blocks[2]).toEqual({ type: 'heading', text: '2. 项目技术栈' });

    const circled = buildReadableBlocks('（一）项目背景\n联想提出天禧战略。\n• 打开要快\n• 导出清晰');
    expect(circled[0]).toEqual({ type: 'heading', text: '（一）项目背景' });
    expect(circled[1]).toEqual({ type: 'paragraph', text: '联想提出天禧战略。' });
    expect(circled[2]).toEqual({ type: 'paragraph', text: '• 打开要快' });
    expect(circled[3]).toEqual({ type: 'paragraph', text: '• 导出清晰' });
  });

  it('parses storage markdown images into image blocks', () => {
    const blocks = buildReadableBlocks(
      '第一段。\n\n![](storage:user/mat.inline.1.jpg)\n\n第二段。',
    );
    expect(blocks[0]).toEqual({ type: 'paragraph', text: '第一段。' });
    expect(blocks[1]).toEqual({ type: 'image', storageKey: 'user/mat.inline.1.jpg' });
    expect(blocks[2]).toEqual({ type: 'paragraph', text: '第二段。' });
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

  it('splits image recognition appendix for folded preview', () => {
    const raw = '正文段落。\n\n【文内图片识别】\n\n【图1】\n识别字';
    expect(splitPreviewBodyAndImageAppendix(raw)).toEqual({
      body: '正文段落。',
      appendix: '【文内图片识别】\n\n【图1】\n识别字',
    });
    expect(splitPreviewBodyAndImageAppendix('仅正文')).toEqual({ body: '仅正文', appendix: '' });
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
