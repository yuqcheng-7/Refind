/**
 * Normalize share / search / modal URLs into canonical content URLs before parse.
 */
export function normalizeSourceUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const host = url.hostname.toLowerCase();

  // Douyin: search/jingxuan pages often carry the real video in modal_id.
  if (/(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$/.test(host)) {
    const modalId = url.searchParams.get('modal_id') || '';
    if (/^\d{5,}$/.test(modalId)) {
      return `https://www.douyin.com/video/${modalId}`;
    }
    const pathVideo = url.pathname.match(/\/video\/(\d+)/);
    if (pathVideo) {
      return `https://www.douyin.com/video/${pathVideo[1]}`;
    }
  }

  // WeChat: trim tracking noise but keep /s/TOKEN path.
  if (/(^|\.)mp\.weixin\.qq\.com$/.test(host)) {
    url.hash = '';
    return url.toString();
  }

  return raw;
}
