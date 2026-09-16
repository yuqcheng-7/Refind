/**
 * Abstract geometric marks for mainstream platform list covers.
 * Intentionally not platform trademarks — original Refind shapes only.
 */

const MAINSTREAM = new Set(['xhs', 'douyin', 'wechat_mp', 'zhihu', 'bilibili']);

const BG = '#2a3340';
const FG = '#f3f5f7';

/** Inner mark paths/shapes per platform (viewBox 0 0 64 64). */
const PLATFORM_MARKS = {
  // Photo note card — lifestyle / figure+caption posts
  xhs: `
    <rect x="14" y="11" width="36" height="42" rx="7" fill="none" stroke="${FG}" stroke-width="3"/>
    <rect x="20" y="17" width="24" height="18" rx="3.5" fill="${FG}"/>
    <rect x="20" y="40" width="18" height="2.6" rx="1.3" fill="${FG}" opacity=".85"/>
    <rect x="20" y="45.5" width="12" height="2.6" rx="1.3" fill="${FG}" opacity=".45"/>
  `,
  // Phone frame + play — short video
  douyin: `
    <rect x="22" y="10" width="20" height="44" rx="6" fill="none" stroke="${FG}" stroke-width="3"/>
    <rect x="28" y="14" width="8" height="2.5" rx="1.25" fill="${FG}" opacity=".55"/>
    <path d="M29.5 26.5v13l12-6.5-12-6.5Z" fill="${FG}"/>
  `,
  // Overlapping speech bubbles — messaging / articles
  wechat_mp: `
    <path d="M18 22c0-5.5 5.8-10 13-10s13 4.5 13 10-5.8 10-13 10c-1.4 0-2.7-.2-3.9-.5L22 36l1.2-4.2C19.4 30.2 18 26.3 18 22Z" fill="${FG}"/>
    <path d="M28 34c0-4.4 4.7-8 10.5-8S49 29.6 49 34s-4.7 8-10.5 8c-1.1 0-2.2-.15-3.2-.4L31 46l1-3.4C29 41.4 28 37.9 28 34Z" fill="${FG}" opacity=".7"/>
  `,
  // Circle + question — Q&A
  zhihu: `
    <circle cx="32" cy="32" r="16" fill="none" stroke="${FG}" stroke-width="3"/>
    <path d="M26.5 27.2c0-3.3 2.5-5.7 5.6-5.7 3 0 5.4 2.2 5.4 5.2 0 2.2-1.1 3.5-2.8 4.6-1.1.7-1.7 1.4-1.7 2.7v.6" fill="none" stroke="${FG}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32.8" cy="41.8" r="2.1" fill="${FG}"/>
  `,
  // Player window + play — long-form video
  bilibili: `
    <rect x="12" y="16" width="40" height="30" rx="6" fill="none" stroke="${FG}" stroke-width="3"/>
    <path d="M28 25v12l12-6-12-6Z" fill="${FG}"/>
    <rect x="18" y="48" width="28" height="3" rx="1.5" fill="${FG}" opacity=".4"/>
  `,
};

const coverCache = new Map();

function buildPlatformCoverSvg(platform) {
  const mark = PLATFORM_MARKS[platform];
  if (!mark) return '';
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${BG}"/>
  ${mark}
</svg>`.trim();
}

export function clearPlatformCoverCache() {
  coverCache.clear();
}

export function isMainstreamPlatform(platform) {
  return MAINSTREAM.has(String(platform || '').trim());
}

export function renderPlatformCoverDataUrl(platform) {
  const code = String(platform || '').trim();
  if (!MAINSTREAM.has(code)) return '';
  if (coverCache.has(code)) return coverCache.get(code);
  const svg = buildPlatformCoverSvg(code);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  coverCache.set(code, url);
  return url;
}

/** @deprecated alias — covers are now generated SVG data URLs */
export function getPlatformCoverUrl(platform) {
  return renderPlatformCoverDataUrl(platform);
}

/** @deprecated use getPlatformCoverUrl / renderPlatformCoverDataUrl */
export function getPlatformCoverSpec(platform) {
  const url = renderPlatformCoverDataUrl(platform);
  return url ? { url } : null;
}
