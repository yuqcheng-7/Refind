import { inferPlatformFromUrl } from '../../lib/api/platformFromUrl.js';
import { isMainstreamPlatform } from './platformCover.js';

function resolveLinkPlatform(material = {}) {
  const explicit = String(material.platform || '').trim();
  if (explicit && isMainstreamPlatform(explicit)) return explicit;
  const inferred = inferPlatformFromUrl(material.url || material.sourceUrl || '');
  return isMainstreamPlatform(inferred) ? inferred : explicit;
}

/**
 * Resolve which source the knowledge list should use for a material cover.
 * Prefer real covers (Storage, then remote URL); mainstream platform marks are fallback only.
 * Uploaded files prefer private Storage covers over external URLs.
 */
export function resolveMaterialCoverSource(material = {}) {
  const inputType = String(material.inputType || '').toLowerCase();
  const isLink = material.kind === 'link' || inputType === 'link' || Boolean(material.url);
  const platform = resolveLinkPlatform(material);

  const coverKey = String(material.coverStorageObjectKey || '').trim();
  if (coverKey) return { kind: 'storage', value: coverKey };

  const coverUrl = String(material.coverImageUrl || '').trim();
  if (coverUrl) return { kind: 'url', value: coverUrl };

  if (isLink && isMainstreamPlatform(platform)) {
    return { kind: 'platform', value: platform };
  }

  const storageKey = String(material.storageObjectKey || '').trim();
  const previewKey = String(material.previewStorageObjectKey || '').trim();

  if (inputType === 'image' && storageKey) {
    return { kind: 'storage', value: storageKey };
  }
  if (inputType === 'pdf' && storageKey) {
    return { kind: 'pdf', value: storageKey };
  }
  if ((inputType === 'pptx' || inputType === 'xlsx' || inputType === 'docx') && previewKey) {
    return { kind: 'pdf', value: previewKey };
  }
  if ((inputType === 'pptx' || inputType === 'docx' || inputType === 'xlsx') && storageKey) {
    return { kind: 'office-embed', value: storageKey };
  }
  if (inputType === 'markdown' || inputType === 'txt' || inputType === 'csv') {
    const snippet = String(material.body || material.summary || '').trim();
    if (snippet || storageKey) {
      return { kind: 'text', value: snippet, storageKey, inputType };
    }
  }
  return { kind: 'none', value: '' };
}

export function buildCoverObjectKey(storageObjectKey, ext = 'jpg') {
  const key = String(storageObjectKey || '').trim();
  if (!key) return '';
  const safeExt = String(ext || 'jpg').replace(/^\./, '').toLowerCase() || 'jpg';
  return `${key}.cover.${safeExt}`;
}

/** Soften markdown markers for compact cover preview. */
export function plainTextForCover(raw = '') {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}[^`]*`{1,3}/g, (block) => block.replace(/`/g, ''))
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
