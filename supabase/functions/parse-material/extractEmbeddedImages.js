/**
 * Collect embedded raster images from Office Open XML packages
 * (docx / pptx / xlsx) for OCR.
 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const MIN_BYTES = 12 * 1024; // skip tiny icons / bullets
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 4;

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
  bmp: 'image/bmp',
};

export function mediaPrefixesForType(inputType) {
  return MEDIA_PREFIX[inputType] || [];
}

export function guessEmbeddedMime(path) {
  const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
  return MIME_BY_EXT[ext] || 'image/jpeg';
}

/**
 * @param {string} inputType
 * @param {Uint8Array} bytes
 * @param {any} JSZip
 * @returns {Promise<Array<{ path: string, fileName: string, mimeType: string, bytes: Uint8Array }>>}
 */
export async function collectEmbeddedOfficeImages(inputType, bytes, JSZip) {
  const prefixes = mediaPrefixesForType(inputType);
  if (!prefixes.length || !JSZip) return [];

  const zip = await JSZip.loadAsync(bytes);
  const paths = Object.keys(zip.files)
    .filter((path) => prefixes.some((prefix) => path.startsWith(prefix)))
    .filter((path) => IMAGE_EXT.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const images = [];
  for (const path of paths) {
    if (images.length >= MAX_IMAGES) break;
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const data = await entry.async('uint8array');
    if (!data?.byteLength || data.byteLength < MIN_BYTES || data.byteLength > MAX_BYTES) {
      continue;
    }
    images.push({
      path,
      fileName: path.split('/').pop() || path,
      mimeType: guessEmbeddedMime(path),
      bytes: data instanceof Uint8Array ? data : new Uint8Array(data),
    });
  }
  return images;
}

/**
 * OCR each embedded image and return an appendix block for content_text.
 */
export async function buildEmbeddedImagesAppendix({
  inputType,
  bytes,
  JSZip,
  extractImageContent,
  dashscopeKey = '',
  fetchImpl = fetch,
} = {}) {
  const images = await collectEmbeddedOfficeImages(inputType, bytes, JSZip);
  if (!images.length) return '';

  const blocks = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    try {
      const extracted = await extractImageContent({
        bytes: image.bytes,
        fileName: image.fileName,
        mimeType: image.mimeType,
        dashscopeKey,
        fetchImpl,
      });
      const body = String(extracted?.content_text || '').trim();
      if (!body) continue;
      blocks.push(`【文内图片 ${index + 1} · ${image.fileName}】\n${body}`);
    } catch {
      // Soft-fail per image; document text remains usable.
    }
  }

  if (!blocks.length) return '';
  return `【文内图片识别】\n\n${blocks.join('\n\n')}`;
}

function base64ToBytes(value) {
  const raw = atob(String(value || ''));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * OCR data-URI images embedded in Markdown / plain text.
 */
export async function buildMarkdownDataImageAppendix({
  text,
  extractImageContent,
  dashscopeKey = '',
  fetchImpl = fetch,
} = {}) {
  const source = String(text || '');
  if (!source.includes('data:image')) return '';

  const pattern = /!\[[^\]]*]\(\s*(data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+))\s*\)/gi;
  const blocks = [];
  let match;
  let index = 0;
  while ((match = pattern.exec(source)) && index < MAX_IMAGES) {
    index += 1;
    try {
      const mimeType = match[2] || 'image/jpeg';
      const bytes = base64ToBytes(String(match[3] || '').replace(/\s+/g, ''));
      if (!bytes.byteLength || bytes.byteLength < MIN_BYTES || bytes.byteLength > MAX_BYTES) {
        continue;
      }
      const extracted = await extractImageContent({
        bytes,
        fileName: `markdown-image-${index}`,
        mimeType,
        dashscopeKey,
        fetchImpl,
      });
      const body = String(extracted?.content_text || '').trim();
      if (!body) continue;
      blocks.push(`【文内图片 ${index}】\n${body}`);
    } catch {
      /* soft-fail */
    }
  }

  if (!blocks.length) return '';
  return `【文内图片识别】\n\n${blocks.join('\n\n')}`;
}
