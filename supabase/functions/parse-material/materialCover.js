/**
 * Pick a cover candidate from Office media / image uploads.
 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const MIN_COVER_BYTES = 2 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const MEDIA_PREFIX = {
  docx: ['word/media/'],
  pptx: ['ppt/media/'],
  xlsx: ['xl/media/'],
};

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function buildCoverObjectKey(storageObjectKey, ext = 'jpg') {
  const key = String(storageObjectKey || '').trim();
  if (!key) return '';
  const safeExt = String(ext || 'jpg').replace(/^\./, '').toLowerCase() || 'jpg';
  return `${key}.cover.${safeExt}`;
}

export function guessCoverExt(pathOrMime = '') {
  const raw = String(pathOrMime || '').toLowerCase();
  if (raw.includes('png') || raw.endsWith('.png')) return 'png';
  if (raw.includes('webp') || raw.endsWith('.webp')) return 'webp';
  if (raw.includes('gif') || raw.endsWith('.gif')) return 'gif';
  return 'jpg';
}

/**
 * @returns {Promise<null | { bytes: Uint8Array, mimeType: string, ext: string }>}
 */
export async function pickOfficeCoverImage(inputType, bytes, JSZip) {
  const prefixes = MEDIA_PREFIX[inputType] || [];
  if (!prefixes.length || !JSZip || !bytes?.byteLength) return null;

  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files)
    .filter((path) => prefixes.some((prefix) => path.startsWith(prefix)))
    .filter((path) => IMAGE_EXT.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const path of paths) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const data = await entry.async('uint8array');
    const imageBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!imageBytes.byteLength || imageBytes.byteLength < MIN_COVER_BYTES) continue;
    if (imageBytes.byteLength > MAX_COVER_BYTES) continue;
    const ext = guessCoverExt(path);
    return {
      bytes: imageBytes,
      mimeType: MIME_BY_EXT[ext] || 'image/jpeg',
      ext,
    };
  }
  return null;
}
