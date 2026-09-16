import { plainTextForCover } from './materialCover.js';

const textCoverCache = new Map();

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function splitLines(text, maxChars, maxLines) {
  const lines = [];
  const paragraphs = String(text || '').split(/\n+/);
  for (const paragraph of paragraphs) {
    const compact = paragraph.trim();
    if (!compact) continue;
    for (let i = 0; i < compact.length; i += maxChars) {
      lines.push(compact.slice(i, i + maxChars));
      if (lines.length >= maxLines) return lines;
    }
  }
  return lines.slice(0, maxLines);
}

/**
 * Build a white mini text preview for markdown / plain text / csv list covers.
 * Uses SVG data URLs so it works without canvas (and in tests).
 */
export function renderTextCoverDataUrl(rawText, {
  cacheKey = '',
  width = 72,
  height = 72,
  label = '',
} = {}) {
  const key = String(cacheKey || '').trim();
  if (key && textCoverCache.has(key)) return textCoverCache.get(key);

  const text = plainTextForCover(rawText);
  if (!text && !label) return '';

  const lines = splitLines(text || (label ? '' : '…'), 9, label ? 5 : 6);
  const startY = label ? 22 : 13;
  const lineNodes = lines
    .map((line, index) => (
      `<text x="7" y="${startY + index * 10}" fill="#374151" font-size="8" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(line)}</text>`
    ))
    .join('');
  const labelNode = label
    ? `<text x="7" y="11" fill="#9ca3af" font-size="7.5" font-weight="600" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(label)}</text>`
    : '';

  // Label-only cover (e.g. PDF/DOC when body unavailable): centered type mark.
  const centeredLabel = label && !lines.length
    ? `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="#4b5563" font-size="15" font-weight="700" font-family="PingFang SC, Microsoft YaHei, sans-serif">${escapeXml(label)}</text>`
    : '';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="8" fill="#ffffff"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="7.5" fill="none" stroke="#e5e7eb"/>
  ${centeredLabel || `${labelNode}${lineNodes}`}
</svg>`.trim();

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (key) textCoverCache.set(key, url);
  return url;
}

export function clearTextCoverCache() {
  textCoverCache.clear();
}
