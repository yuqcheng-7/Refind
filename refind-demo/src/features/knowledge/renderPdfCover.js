/**
 * Render the first page of a PDF into a small JPEG/PNG data URL for list covers.
 * Browser-only (uses canvas). Soft-fails to empty string.
 *
 * Important: do not call getDocumentProxy on the same Uint8Array before
 * renderPageAsImage — PDF.js transfers/detaches the buffer (DataCloneError).
 */
const coverCache = new Map();

async function fetchPdfBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`pdf fetch failed (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function renderPdfCoverDataUrl(signedPdfUrl, {
  cacheKey = '',
  maxEdge = 160,
  renderPageAsImage,
  pdfBytes,
} = {}) {
  const key = String(cacheKey || signedPdfUrl || '').trim();
  if (key && coverCache.has(key)) return coverCache.get(key);

  if ((!signedPdfUrl && !pdfBytes) || typeof document === 'undefined') return '';

  try {
    const unpdf = renderPageAsImage
      ? { renderPageAsImage }
      : await import('unpdf');
    const bytes = pdfBytes || await fetchPdfBytes(signedPdfUrl);
    const data = await unpdf.renderPageAsImage(bytes, 1, {
      width: maxEdge,
      toDataURL: true,
    });
    const url = typeof data === 'string' ? data : '';
    if (key && url) coverCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

export function clearPdfCoverCache() {
  coverCache.clear();
}
