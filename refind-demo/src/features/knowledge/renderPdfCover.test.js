import { describe, expect, it, vi } from 'vitest';
import { clearPdfCoverCache, renderPdfCoverDataUrl } from './renderPdfCover.js';

describe('renderPdfCoverDataUrl', () => {
  it('renders with width option and does not pre-load the same buffer', async () => {
    clearPdfCoverCache();
    const bytes = new Uint8Array([1, 2, 3]);
    const renderPageAsImage = vi.fn(async () => 'data:image/png;base64,abc');

    const url = await renderPdfCoverDataUrl('https://signed.example/a.pdf', {
      cacheKey: 't1',
      maxEdge: 120,
      pdfBytes: bytes,
      renderPageAsImage,
    });

    expect(url).toBe('data:image/png;base64,abc');
    expect(renderPageAsImage).toHaveBeenCalledTimes(1);
    expect(renderPageAsImage.mock.calls[0][0]).toBe(bytes);
    expect(renderPageAsImage.mock.calls[0][1]).toBe(1);
    expect(renderPageAsImage.mock.calls[0][2]).toMatchObject({
      width: 120,
      toDataURL: true,
    });
  });

  it('soft-fails to empty string on render errors', async () => {
    clearPdfCoverCache();
    const url = await renderPdfCoverDataUrl('https://signed.example/a.pdf', {
      cacheKey: 't2',
      pdfBytes: new Uint8Array([1]),
      renderPageAsImage: async () => {
        throw new Error('DataCloneError: ArrayBuffer already detached');
      },
    });
    expect(url).toBe('');
  });
});
