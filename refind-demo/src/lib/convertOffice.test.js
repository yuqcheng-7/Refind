import { describe, expect, it, vi } from 'vitest';
import {
  buildPreviewObjectKey,
  convertOfficeToPdf,
} from '../../../supabase/functions/parse-material/convertOffice.js';

describe('convertOfficeToPdf', () => {
  it('returns null when convert URL missing', async () => {
    await expect(convertOfficeToPdf({
      filename: 'a.pptx',
      bytes: new Uint8Array([1, 2, 3]),
    })).resolves.toBeNull();
  });

  it('uses Gotenberg multipart when engine=gotenberg', async () => {
    const pdfBytes = Uint8Array.from([37, 80, 68, 70]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
    });

    const result = await convertOfficeToPdf({
      convertUrl: 'https://convert.example.com',
      engine: 'gotenberg',
      filename: 'a.pptx',
      bytes: new Uint8Array([1, 2, 3]),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://convert.example.com/forms/libreoffice/convert',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(Array.from(result.bytes)).toEqual([37, 80, 68, 70]);
  });

  it('decodes PDF from refind convert-office response', async () => {
    const pdfBytes = new Uint8Array([37, 80, 68, 70]); // %PDF
    const content_base64 = btoa(String.fromCharCode(...pdfBytes));
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, filename: 'a.pdf', content_base64 }),
    });

    const result = await convertOfficeToPdf({
      convertUrl: 'http://127.0.0.1:8787',
      engine: 'refind',
      filename: 'a.pptx',
      bytes: new Uint8Array([1, 2, 3]),
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/convert-office',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result?.filename).toBe('a.pdf');
    expect(Array.from(result.bytes)).toEqual([37, 80, 68, 70]);
  });

  it('builds preview object keys beside originals', () => {
    expect(buildPreviewObjectKey('user/file.pptx')).toBe('user/file.pptx.preview.pdf');
  });
});
