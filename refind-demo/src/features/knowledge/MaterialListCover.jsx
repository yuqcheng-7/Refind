import { useEffect, useMemo, useState } from 'react';
import { createMaterialSignedUrl } from '../../lib/api/materials.js';
import { extractOfficeEmbedCoverDataUrl } from './extractOfficeEmbedCover.js';
import {
  getListCover,
  listCoverCacheKey,
  loadListCoverOnce,
  setListCover,
} from './listCoverCache.js';
import { resolveMaterialCoverSource } from './materialCover.js';
import { renderPdfCoverDataUrl } from './renderPdfCover.js';
import { isMainstreamPlatform, renderPlatformCoverDataUrl } from './platformCover.js';
import { renderTextCoverDataUrl } from './renderTextCover.js';
import { inferPlatformFromUrl } from '../../lib/api/platformFromUrl.js';

function resolveCoverPlatform(material = {}) {
  const explicit = String(material.platform || '').trim();
  if (explicit && isMainstreamPlatform(explicit)) return explicit;
  const inferred = inferPlatformFromUrl(material.url || material.sourceUrl || '');
  return isMainstreamPlatform(inferred) ? inferred : '';
}

async function loadTextSnippet(source) {
  const inline = String(source.value || '').trim();
  if (inline) return inline;
  const key = String(source.storageKey || '').trim();
  if (!key) return '';
  const signed = await createMaterialSignedUrl(key);
  const response = await fetch(signed);
  if (!response.ok) throw new Error('text fetch failed');
  const text = await response.text();
  return String(text || '').slice(0, 1200);
}

function textCoverLabel(inputType) {
  if (inputType === 'markdown') return 'MD';
  if (inputType === 'csv') return 'CSV';
  if (inputType === 'txt') return 'TXT';
  if (inputType === 'note') return '笔记';
  if (inputType === 'pdf') return 'PDF';
  if (inputType === 'docx' || inputType === 'doc') return 'DOC';
  if (inputType === 'pptx') return 'PPT';
  if (inputType === 'xlsx') return 'XLS';
  return '';
}

function fallbackTextCover(material, label) {
  const snippet = String(material?.body || material?.summary || '').trim().slice(0, 1200);
  return renderTextCoverDataUrl(snippet, {
    cacheKey: `${material?.id || ''}:fallback:${label}:${snippet.slice(0, 40)}`,
    label,
  });
}

async function resolveCoverUrl(material, source) {
  const typeLabel = textCoverLabel(material?.inputType);

  if (source.kind === 'platform') {
    return renderPlatformCoverDataUrl(source.value) || '';
  }
  if (source.kind === 'url') {
    return String(source.value || '').trim();
  }
  if (source.kind === 'storage') {
    return createMaterialSignedUrl(source.value);
  }
  if (source.kind === 'pdf') {
    const signed = await createMaterialSignedUrl(source.value);
    const dataUrl = await renderPdfCoverDataUrl(signed, {
      cacheKey: `${material?.id || ''}:${source.value}`,
    });
    return dataUrl || fallbackTextCover(material, typeLabel || 'PDF') || '';
  }
  if (source.kind === 'office-embed') {
    const signed = await createMaterialSignedUrl(source.value);
    const response = await fetch(signed);
    if (!response.ok) throw new Error('office fetch failed');
    const buffer = await response.arrayBuffer();
    const dataUrl = await extractOfficeEmbedCoverDataUrl(buffer, material?.inputType);
    return dataUrl || fallbackTextCover(material, typeLabel || 'DOC') || '';
  }
  if (source.kind === 'text') {
    const snippet = await loadTextSnippet(source);
    return renderTextCoverDataUrl(snippet, {
      cacheKey: `${material?.id || ''}:text:${snippet.slice(0, 80)}`,
      label: textCoverLabel(source.inputType || material?.inputType),
    }) || '';
  }
  if (source.kind === 'none' && typeLabel) {
    return fallbackTextCover(material, typeLabel) || '';
  }
  return '';
}

/**
 * List thumbnail for links (platform marks) and uploaded files.
 */
export function MaterialListCover({ material, fallback }) {
  const source = useMemo(() => resolveMaterialCoverSource(material), [
    material?.id,
    material?.kind,
    material?.platform,
    material?.url,
    material?.coverImageUrl,
    material?.coverStorageObjectKey,
    material?.inputType,
    material?.storageObjectKey,
    material?.previewStorageObjectKey,
    material?.body,
    material?.summary,
  ]);
  const cacheKey = useMemo(
    () => listCoverCacheKey(material, source),
    [material?.id, source.kind, source.value, source.storageKey, source.inputType, material?.inputType],
  );
  const [src, setSrc] = useState(() => getListCover(cacheKey));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const cached = getListCover(cacheKey);
    if (cached) {
      setSrc(cached);
      return undefined;
    }

    setSrc('');
    loadListCoverOnce(cacheKey, () => resolveCoverUrl(material, source))
      .then((url) => {
        if (cancelled) return;
        setSrc(url || '');
      })
      .catch(() => {
        if (cancelled) return;
        const typeLabel = textCoverLabel(material?.inputType);
        const url = typeLabel ? fallbackTextCover(material, typeLabel) : '';
        if (url) setListCover(cacheKey, url);
        setSrc(url || '');
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, material, source]);

  if (!src || failed) {
    return <div className="material-mark">{fallback}</div>;
  }

  const platformFallback = resolveCoverPlatform(material);
  const platformFallbackUrl = platformFallback ? renderPlatformCoverDataUrl(platformFallback) : '';

  return (
    <div className="material-mark is-cover">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (platformFallbackUrl && src !== platformFallbackUrl) {
            setListCover(cacheKey, platformFallbackUrl);
            setSrc(platformFallbackUrl);
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
