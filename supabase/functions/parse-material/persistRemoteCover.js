/**
 * Download a remote cover image into the private materials bucket
 * so list thumbnails are not blocked by platform hotlink protection.
 */

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MIN_COVER_BYTES = 256;
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function guessExt(contentType = '', url = '') {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  const path = String(url || '').split('?')[0].toLowerCase();
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

export function buildLinkCoverObjectKey(userId, materialId, ext = 'jpg') {
  const uid = String(userId || '').trim();
  const mid = String(materialId || '').trim();
  if (!uid || !mid) return '';
  const safeExt = String(ext || 'jpg').replace(/^\./, '').toLowerCase() || 'jpg';
  return `${uid}/${mid}.cover.${safeExt}`;
}

/**
 * @returns {Promise<string>} storage object key or ''
 */
export async function persistRemoteCoverImage({
  admin,
  userId,
  materialId,
  coverUrl,
  referer = '',
  fetchImpl = fetch,
} = {}) {
  const url = String(coverUrl || '').trim();
  if (!url || !admin || !userId || !materialId) return '';
  if (!/^https?:\/\//i.test(url)) return '';

  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) return '';
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < MIN_COVER_BYTES || buffer.byteLength > MAX_COVER_BYTES) return '';

    const ext = guessExt(contentType, url);
    const key = buildLinkCoverObjectKey(userId, materialId, ext);
    const { error } = await admin.storage.from('materials').upload(key, buffer, {
      contentType: mimeForExt(ext),
      upsert: true,
    });
    if (error) return '';
    return key;
  } catch {
    return '';
  }
}
