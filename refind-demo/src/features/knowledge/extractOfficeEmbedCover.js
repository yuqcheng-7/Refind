/**
 * Extract the first raster image from an Office Open XML package for list covers.
 */
const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
const MIN_BYTES = 512;

const MEDIA_PREFIX = {
  docx: ['word/media/'],
  pptx: ['ppt/media/'],
  xlsx: ['xl/media/'],
};

function guessMime(path) {
  const ext = String(path || '').split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export async function extractOfficeEmbedCoverDataUrl(arrayBuffer, inputType, JSZipImpl) {
  const prefixes = MEDIA_PREFIX[inputType] || [];
  if (!prefixes.length || !arrayBuffer) return '';

  const JSZip = JSZipImpl || (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const paths = Object.keys(zip.files)
    .filter((path) => prefixes.some((prefix) => path.startsWith(prefix)))
    .filter((path) => IMAGE_EXT.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const path of paths) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    const bytes = await entry.async('uint8array');
    if (!bytes?.byteLength || bytes.byteLength < MIN_BYTES) continue;
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${guessMime(path)};base64,${btoa(binary)}`;
  }
  return '';
}
