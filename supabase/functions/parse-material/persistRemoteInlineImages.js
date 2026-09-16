/**
 * Download ordered remote inline images into the private materials bucket
 * for preview + OCR (anti-hotlink / expiry).
 */

import { fetchRemoteImageBytes, uniqueUrls } from './extractRemoteMediaImages.js';

const INLINE_IMAGE_LIMIT = 10;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function guessExt(contentType = '', url = '', fileName = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  const path = String(fileName || url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.webp')) return 'webp';
  if (path.endsWith('.gif')) return 'gif';
  return 'jpg';
}

function mimeForExt(ext) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export function buildInlineImageObjectKey(userId, materialId, index, ext = 'jpg') {
  const uid = String(userId || '').trim();
  const mid = String(materialId || '').trim();
  const n = Number(index);
  if (!uid || !mid || !Number.isFinite(n) || n < 1) return '';
  const safeExt = String(ext || 'jpg').replace(/^\./, '').toLowerCase() || 'jpg';
  return `${uid}/${mid}.inline.${n}.${safeExt}`;
}

/**
 * @returns {Promise<Array<{ index: number, objectKey: string, sourceUrl: string, bytes: Uint8Array, mimeType: string }>>}
 */
export async function persistRemoteInlineImages({
  admin,
  userId,
  materialId,
  mediaUrls = [],
  referer = '',
  fetchImpl = fetch,
  userAgent = BROWSER_UA,
  limit = INLINE_IMAGE_LIMIT,
} = {}) {
  if (!admin || !userId || !materialId) return [];
  const urls = uniqueUrls(mediaUrls).slice(0, Math.max(1, Number(limit) || INLINE_IMAGE_LIMIT));
  if (!urls.length) return [];

  const out = [];
  for (let i = 0; i < urls.length; i += 1) {
    const sourceUrl = urls[i];
    try {
      const fetched = await fetchRemoteImageBytes(sourceUrl, {
        fetchImpl,
        userAgent: userAgent || BROWSER_UA,
      });
      if (!fetched?.bytes?.byteLength) continue;

      const ext = guessExt(fetched.mimeType, sourceUrl, fetched.fileName);
      const objectKey = buildInlineImageObjectKey(userId, materialId, i + 1, ext);
      if (!objectKey) continue;

      const mimeType = mimeForExt(ext);
      const { error } = await admin.storage.from('materials').upload(objectKey, fetched.bytes, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) continue;

      out.push({
        index: i + 1,
        objectKey,
        sourceUrl,
        bytes: fetched.bytes,
        mimeType,
      });
    } catch {
      // Soft-fail per image.
    }
  }
  return out;
}

export { INLINE_IMAGE_LIMIT };
