import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  buildEmbeddedImagesAppendix,
  buildMarkdownDataImageAppendix,
  collectEmbeddedOfficeImages,
} from '../../../supabase/functions/parse-material/extractEmbeddedImages.js';

async function zipFromFiles(files) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

describe('collectEmbeddedOfficeImages', () => {
  it('collects media images from docx and skips tiny files', async () => {
    const big = new Uint8Array(13 * 1024).fill(7);
    const tiny = new Uint8Array(100).fill(1);
    const bytes = await zipFromFiles({
      'word/document.xml': '<w:document></w:document>',
      'word/media/image1.png': big,
      'word/media/icon.png': tiny,
    });

    const images = await collectEmbeddedOfficeImages('docx', bytes, JSZip);
    expect(images).toHaveLength(1);
    expect(images[0].fileName).toBe('image1.png');
    expect(images[0].mimeType).toBe('image/png');
  });
});

describe('buildEmbeddedImagesAppendix', () => {
  it('appends OCR blocks for office media', async () => {
    const big = new Uint8Array(13 * 1024).fill(7);
    const bytes = await zipFromFiles({
      'ppt/slides/slide1.xml': '<p:sld></p:sld>',
      'ppt/media/photo.jpg': big,
    });
    const extractImageContent = vi.fn().mockResolvedValue({
      content_text: '【识别文字】\n图表标题',
    });

    const appendix = await buildEmbeddedImagesAppendix({
      inputType: 'pptx',
      bytes,
      JSZip,
      extractImageContent,
      dashscopeKey: 'sk-test',
    });

    expect(appendix).toContain('【文内图片识别】');
    expect(appendix).toContain('photo.jpg');
    expect(appendix).toContain('图表标题');
    expect(extractImageContent).toHaveBeenCalledTimes(1);
  });
});

describe('buildMarkdownDataImageAppendix', () => {
  it('OCRs markdown data-URI images', async () => {
    const payload = btoa('x'.repeat(13000));
    const text = `前言\n\n![图](data:image/png;base64,${payload})\n\n结尾`;
    const extractImageContent = vi.fn().mockResolvedValue({
      content_text: '【画面描述】\n示意图',
    });

    const appendix = await buildMarkdownDataImageAppendix({
      text,
      extractImageContent,
      dashscopeKey: 'sk-test',
    });

    expect(appendix).toContain('【文内图片识别】');
    expect(appendix).toContain('示意图');
    expect(extractImageContent).toHaveBeenCalled();
  });
});
