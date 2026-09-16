import { describe, expect, it, vi } from 'vitest';
import {
  extractImageContent,
  guessImageMime,
} from '../../../supabase/functions/parse-material/extractImageContent.js';

describe('extractImageContent', () => {
  it('guesses mime from extension', () => {
    expect(guessImageMime('shot.PNG')).toBe('image/png');
    expect(guessImageMime('a.jpg')).toBe('image/jpeg');
  });

  it('returns placeholder text when no API key', async () => {
    const result = await extractImageContent({
      bytes: new Uint8Array([1, 2, 3, 4]),
      fileName: '截图.png',
      dashscopeKey: '',
    });
    expect(result.usedAi).toBe(false);
    expect(result.content_text).toContain('截图.png');
  });

  it('parses vision JSON into OCR + description', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              ocr_text: '会议纪要',
              description: '一张白板照片',
            }),
          },
        }],
      }),
    });

    const result = await extractImageContent({
      bytes: new Uint8Array([9, 9, 9]),
      fileName: 'board.jpg',
      mimeType: 'image/jpeg',
      dashscopeKey: 'sk-test',
      visionModel: 'qwen-vl-plus',
      fetchImpl,
    });

    expect(result.usedAi).toBe(true);
    expect(result.ocr_text).toBe('会议纪要');
    expect(result.description).toBe('一张白板照片');
    expect(result.content_text).toContain('【识别文字】');
    expect(result.content_text).toContain('会议纪要');
    expect(fetchImpl).toHaveBeenCalled();
  });
});
