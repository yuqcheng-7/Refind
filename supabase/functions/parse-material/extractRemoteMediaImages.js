/**
 * OCR remote image URLs (e.g. Xiaohongshu note carousel from MediaCrawler media_urls).
 */

import { isAllowedPublicUrl } from './urlSafety.js';
import { guessImageMime } from './extractImageContent.js';

const MAX_IMAGES = 9;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = /^image\//i;

function uniqueUrls(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const url = String(value || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function refererForImageUrl(url) {
  const host = String(url?.hostname || '').toLowerCase();
  if (host.includes('xiaohongshu.com') || host.includes('xhscdn.com') || host.includes('xhslink.com')) {
    return 'https://www.xiaohongshu.com/';
  }
  return `${url.protocol}//${url.host}/`;
}

async function fetchRemoteImageBytes(url, { fetchImpl = fetch, userAgent = '' } = {}) {
  if (!isAllowedPublicUrl(url)) return null;

  let current = new URL(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchImpl(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': userAgent || 'Mozilla/5.0 (compatible; Refind/1.0)',
        Referer: refererForImageUrl(current),
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 5) return null;
      const next = new URL(location, current);
      if (!isAllowedPublicUrl(next.href)) return null;
      current = next;
      continue;
    }

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim() || '';
    if (contentType && !IMAGE_CONTENT_TYPES.test(contentType)) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const fileName = current.pathname.split('/').pop() || 'image.jpg';
    return {
      bytes,
      fileName,
      mimeType: contentType || guessImageMime(fileName),
      url: current.href,
    };
  }

  return null;
}

/**
 * @param {object} args
 * @param {string[]} args.mediaUrls
 * @param {typeof import('./extractImageContent.js').extractImageContent} args.extractImageContent
 * @param {string} [args.dashscopeKey]
 * @param {typeof fetch} [args.fetchImpl]
 * @param {string} [args.userAgent]
 * @returns {Promise<string>}
 */
export async function buildMediaUrlsAppendix({
  mediaUrls = [],
  extractImageContent,
  dashscopeKey = '',
  fetchImpl = fetch,
  userAgent = '',
} = {}) {
  const urls = uniqueUrls(mediaUrls).slice(0, MAX_IMAGES);
  if (!urls.length || typeof extractImageContent !== 'function') return '';

  const blocks = [];
  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    try {
      const fetched = await fetchRemoteImageBytes(url, { fetchImpl, userAgent });
      if (!fetched?.bytes?.byteLength) continue;

      const extracted = await extractImageContent({
        bytes: fetched.bytes,
        fileName: fetched.fileName,
        mimeType: fetched.mimeType,
        dashscopeKey,
        fetchImpl,
      });
      const body = String(extracted?.content_text || '').trim();
      if (!body) continue;
      blocks.push(`【笔记图片 ${index + 1}】\n${body}`);
    } catch {
      // Soft-fail per image; caption/comments remain usable.
    }
  }

  if (!blocks.length) return '';
  return `【文内图片识别】\n\n${blocks.join('\n\n')}`;
}

export { fetchRemoteImageBytes, uniqueUrls, MAX_IMAGES };
