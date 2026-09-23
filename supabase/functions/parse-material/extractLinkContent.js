const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const PLATFORM_HOSTS = [
  { code: 'xhs', pattern: /(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/ },
  { code: 'douyin', pattern: /(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)v\.douyin\.com$/ },
  { code: 'zhihu', pattern: /(^|\.)zhihu\.com$/ },
  { code: 'bilibili', pattern: /(^|\.)bilibili\.com$|(^|\.)b23\.tv$/ },
  { code: 'wechat_mp', pattern: /(^|\.)mp\.weixin\.qq\.com$/ },
];

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function detectPlatform(sourceUrl) {
  if (!sourceUrl) return 'web';
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    for (const entry of PLATFORM_HOSTS) {
      if (entry.pattern.test(hostname)) return entry.code;
    }
  } catch {
    return 'web';
  }
  return 'web';
}

function metaContent(html, names) {
  for (const name of names) {
    const propRe = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const contentFirst = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      'i',
    );
    const match = propRe.exec(html) || contentFirst.exec(html);
    if (match?.[1]) return cleanText(decodeHtmlEntities(match[1]));
  }
  return '';
}

export function absolutizeUrl(value, baseUrl = '') {
  const raw = cleanText(value);
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw, baseUrl || undefined).href;
  } catch {
    return /^https?:\/\//i.test(raw) ? raw : '';
  }
}

export function extractOpenGraph(html, baseUrl = '') {
  const title = metaContent(html, ['og:title', 'twitter:title'])
    || (() => {
      const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      return match ? cleanText(decodeHtmlEntities(match[1])) : '';
    })();
  const description = metaContent(html, ['og:description', 'twitter:description', 'description']);
  const siteName = metaContent(html, ['og:site_name']);
  const image = absolutizeUrl(metaContent(html, ['og:image', 'twitter:image']), baseUrl);
  return { title, description, siteName, image };
}

function stripNoise(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|footer|header|aside|iframe|svg|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function htmlToParagraphText(fragment) {
  const withBreaks = stripNoise(fragment)
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function pickLargestMatch(html, patterns) {
  let best = '';
  for (const pattern of patterns) {
    const re = new RegExp(pattern, 'gi');
    for (const match of html.matchAll(re)) {
      const text = htmlToParagraphText(match[1] || '');
      if (text.length > best.length) best = text;
    }
  }
  return best;
}

export function extractReadableBody(html) {
  if (!html) return '';
  const targeted = pickLargestMatch(html, [
    'id=["\']js_content["\'][^>]*>([\\s\\S]*?)</div>',
    'class=["\'][^"\']*RichText[^"\']*["\'][^>]*>([\\s\\S]*?)</div>',
    'class=["\'][^"\']*article-content[^"\']*["\'][^>]*>([\\s\\S]*?)</div>',
    '<article\\b[^>]*>([\\s\\S]*?)</article>',
    '<main\\b[^>]*>([\\s\\S]*?)</main>',
  ]);
  if (targeted.length >= 80) return targeted;

  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const bodyText = htmlToParagraphText(bodyMatch?.[1] || html);
  return bodyText;
}

export function extractBilibiliId(sourceUrl) {
  const raw = String(sourceUrl || '');
  const bv = raw.match(/\b(BV[\w]+)\b/i)?.[1];
  if (bv) return { type: 'bvid', value: bv };

  try {
    const url = new URL(raw);
    const av = url.pathname.match(/\/video\/av(\d+)/i)?.[1]
      || url.searchParams.get('aid');
    if (av) return { type: 'aid', value: String(av) };
  } catch {
    /* ignore invalid URL */
  }
  return null;
}

export function extractBilibiliIdFromHtml(html) {
  const raw = String(html || '');
  const bv = raw.match(/"bvid"\s*:\s*"(BV[\w]+)"/i)?.[1]
    || raw.match(/bilibili\.com\/video\/(BV[\w]+)/i)?.[1]
    || raw.match(/\b(BV[\w]+)\b/i)?.[1];
  if (bv) return { type: 'bvid', value: bv };
  const aid = raw.match(/"aid"\s*:\s*(\d+)/i)?.[1];
  if (aid) return { type: 'aid', value: aid };
  return null;
}

export function bilibiliEmbedUrl(sourceUrl, id = null) {
  const resolved = id || extractBilibiliId(sourceUrl);
  if (!resolved) return '';
  if (resolved.type === 'bvid') {
    return `https://player.bilibili.com/player.html?bvid=${resolved.value}&autoplay=0`;
  }
  return `https://player.bilibili.com/player.html?aid=${resolved.value}&autoplay=0`;
}

export async function resolveRedirectChain(sourceUrl, fetchFn = fetch, maxHops = 5) {
  let current = sourceUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    let response;
    try {
      response = await fetchFn(current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return current;
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response.url || current;
    }
    const location = response.headers?.get?.('location');
    if (!location) return current;
    current = new URL(location, current).href;
  }
  return current;
}

function bilibiliFallback(sourceUrl, id) {
  if (!id) return null;
  const label = id.type === 'bvid' ? id.value : `av${id.value}`;
  const title = `B站视频 ${label}`;
  const note = `已收藏 B 站视频 ${label}。源站暂未返回简介，可先播放或打开原站。`;
  return {
    platform: 'bilibili',
    title,
    author_name: '',
    caption_text: '',
    content_text: note,
    summary_seed: `视频 ${label} 已入库。完整简介与 AI 摘要待源站数据可用后补全。`,
    playback_mode: 'embed',
    playback_url: bilibiliEmbedUrl(sourceUrl, id),
    quality: 'partial',
  };
}

async function fetchJson(url, fetchFn) {
  const response = await fetchFn(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      Referer: 'https://www.bilibili.com/',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`接口请求失败 (${response.status})`);
  return response.json();
}

export async function fetchBilibiliMeta(sourceUrl, fetchFn = fetch) {
  const id = extractBilibiliId(sourceUrl);
  if (!id) return null;
  const query = id.type === 'bvid' ? `bvid=${id.value}` : `aid=${id.value}`;
  try {
    const payload = await fetchJson(
      `https://api.bilibili.com/x/web-interface/view?${query}`,
      fetchFn,
    );
    if (payload?.code !== 0 || !payload?.data) return bilibiliFallback(sourceUrl, id);
    const data = payload.data;
    const title = cleanText(data.title || '');
    const description = usableText(data.desc || data.description || '', title);
    const author = cleanText(data.owner?.name || '');
    const tags = Array.isArray(data.tag)
      ? data.tag.map((item) => cleanText(item.tag_name || item)).filter(Boolean)
      : [];
    return {
      platform: 'bilibili',
      title: title || bilibiliFallback(sourceUrl, id).title,
      author_name: author,
      caption_text: description,
      content_text: description,
      summary_seed: description,
      cover_image_url: absolutizeUrl(data.pic || data.cover || ''),
      tags,
      playback_mode: 'embed',
      playback_url: bilibiliEmbedUrl(sourceUrl, id),
      quality: qualityFromText(description, title),
    };
  } catch {
    return bilibiliFallback(sourceUrl, id);
  }
}

async function tryExternalParser(sourceUrl, env = {}, fetchFn = fetch) {
  const base = cleanText(env.PLATFORM_PARSER_URL || '');
  if (!base) return null;
  const platform = detectPlatform(sourceUrl);
  // Hosted soft-launch: shared parser sessions. Prefer them for login-walled platforms
  // so Edge fallback is not stuck on anonymous 403 when browser prefetch missed.
  const useSavedSession = ['xhs', 'douyin', 'zhihu', 'bilibili'].includes(platform);
  try {
    const response = await fetchFn(new URL('/parse', base).href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
      },
      body: JSON.stringify({
        url: sourceUrl,
        use_saved_session: useSavedSession,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error) return null;
    const title = cleanText(data.title || '');
    const content = cleanText(data.content_text || data.description || '');
    if (isZhihuJunkResult(platform, title, content)) return null;
    return {
      platform: data.platform || platform,
      title,
      author_name: cleanText(data.author_name || data.author || ''),
      caption_text: cleanText(data.caption_text || data.description || ''),
      subtitle_text: cleanText(data.subtitle_text || data.subtitles || ''),
      content_text: content,
      summary_seed: cleanText(data.summary || data.description || data.content_text || ''),
      cover_image_url: absolutizeUrl(
        data.cover_image_url || data.cover || data.thumbnail || data.image || '',
        sourceUrl,
      ),
      playback_mode: data.playback_mode || null,
      playback_url: cleanText(data.playback_url || ''),
      playback_embed_html: cleanText(data.playback_embed_html || ''),
      quality: data.quality || (data.content_text ? 'full' : 'partial'),
      media_urls: uniqueMediaUrls(Array.isArray(data.media_urls) ? data.media_urls : []),
    };
  } catch {
    return null;
  }
}

/** Zhihu often returns a soft 404 / marketing shell that looks like a successful parse. */
export function isZhihuJunkResult(platform, title = '', content = '') {
  if (platform !== 'zhihu') return false;
  const t = cleanText(title);
  const c = cleanText(content);
  if (/没有知识存在的荒原|安全验证|请先登录|404\s*-\s*知乎|^知乎$/.test(t)) return true;
  if (c.length > 0 && c.length < 280 && /中文互联网高质量的问答社区/.test(c)) return true;
  return false;
}

function preferLonger(current, next) {
  const a = cleanText(current);
  const b = cleanText(next);
  return b.length > a.length ? b : a;
}

function preferCover(current, next) {
  return cleanText(current) || cleanText(next);
}

const INLINE_IMAGE_LIMIT = 10;

export function extractMediaUrlsFromHtml(html = '', baseUrl = '', limit = INLINE_IMAGE_LIMIT) {
  const cap = Math.max(1, Number(limit) || INLINE_IMAGE_LIMIT);
  const source = String(html || '');
  const re = /<img\b[^>]*?\b(?:src|data-src|data-original|data-actualsrc)=["']([^"']+)["']/gi;
  const out = [];
  const seen = new Set();
  let match = re.exec(source);
  while (match) {
    const raw = cleanText(match[1]);
    if (raw && !raw.startsWith('data:')) {
      const url = absolutizeUrl(raw, baseUrl);
      if (url.startsWith('http') && !seen.has(url)) {
        seen.add(url);
        out.push(url);
        if (out.length >= cap) break;
      }
    }
    match = re.exec(source);
  }
  return out;
}

function uniqueMediaUrls(values, limit = INLINE_IMAGE_LIMIT) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const url = cleanText(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

function preferMediaUrls(current, next) {
  const a = Array.isArray(current) ? current : [];
  const b = Array.isArray(next) ? next : [];
  if (!b.length) return uniqueMediaUrls(a);
  if (!a.length) return uniqueMediaUrls(b);
  return uniqueMediaUrls([...a, ...b]);
}

function mergeResult(base, patch) {
  if (!patch) return base;
  return {
    ...base,
    platform: patch.platform || base.platform,
    title: preferLonger(base.title, patch.title),
    author_name: preferLonger(base.author_name, patch.author_name),
    caption_text: preferLonger(base.caption_text, patch.caption_text),
    subtitle_text: preferLonger(base.subtitle_text, patch.subtitle_text),
    content_text: preferLonger(base.content_text, patch.content_text),
    summary_seed: preferLonger(base.summary_seed, patch.summary_seed),
    cover_image_url: preferCover(base.cover_image_url, patch.cover_image_url),
    playback_mode: patch.playback_mode || base.playback_mode,
    playback_url: preferLonger(base.playback_url, patch.playback_url),
    playback_embed_html: preferLonger(base.playback_embed_html, patch.playback_embed_html),
    quality: patch.quality === 'full' || base.quality === 'full'
      ? 'full'
      : (patch.quality || base.quality),
    media_urls: preferMediaUrls(base.media_urls, patch.media_urls),
  };
}

function qualityFromText(text, title) {
  const body = cleanText(text);
  if (body.length >= 80) return 'full';
  if (body.length >= 20 || (title && body.length >= 8)) return 'partial';
  if (title) return 'partial';
  return 'none';
}

function usableText(value, fallback = '') {
  const text = cleanText(value);
  if (text.length >= 8) return text;
  return cleanText(fallback);
}

/**
 * Hybrid link extract: platform APIs → optional external parser → OG/body HTML.
 * quality: full | partial | none
 */
export async function extractLinkContent({
  sourceUrl,
  html = '',
  env = {},
  fetchFn = fetch,
  resolvedUrl = '',
} = {}) {
  let workingUrl = resolvedUrl || sourceUrl;
  const platform = detectPlatform(sourceUrl) || detectPlatform(workingUrl);
  let result = {
    platform,
    title: '',
    author_name: '',
    caption_text: '',
    subtitle_text: '',
    content_text: '',
    summary_seed: '',
    cover_image_url: '',
    playback_mode: null,
    playback_url: '',
    playback_embed_html: '',
    quality: 'none',
    canonical_url: workingUrl,
    media_urls: [],
  };

  if (platform === 'bilibili') {
    let biliId = extractBilibiliId(workingUrl) || extractBilibiliId(sourceUrl) || extractBilibiliIdFromHtml(html);
    if (!biliId) {
      workingUrl = await resolveRedirectChain(sourceUrl, fetchFn);
      result.canonical_url = workingUrl;
      biliId = extractBilibiliId(workingUrl) || extractBilibiliIdFromHtml(html);
    }
    try {
      result = mergeResult(
        result,
        await fetchBilibiliMeta(workingUrl || sourceUrl, fetchFn),
      );
    } catch {
      result = mergeResult(result, bilibiliFallback(workingUrl || sourceUrl, biliId));
    }
    if (!result.content_text && biliId) {
      result = mergeResult(result, bilibiliFallback(workingUrl || sourceUrl, biliId));
    }
  }

  result = mergeResult(result, await tryExternalParser(workingUrl || sourceUrl, env, fetchFn));

  const og = extractOpenGraph(html, workingUrl || sourceUrl);
  const body = extractReadableBody(html);
  const mediaFromHtml = extractMediaUrlsFromHtml(html, workingUrl || sourceUrl);
  const ogPatch = {
    title: og.title,
    caption_text: platform === 'douyin' || platform === 'bilibili' ? og.description : '',
    content_text: preferLonger(body, og.description),
    summary_seed: preferLonger(og.description, body.slice(0, 240)),
    cover_image_url: og.image,
    quality: qualityFromText(preferLonger(body, og.description), og.title),
    media_urls: mediaFromHtml,
  };
  if (platform === 'bilibili' || platform === 'douyin') {
    const biliId = extractBilibiliId(workingUrl)
      || extractBilibiliId(sourceUrl)
      || extractBilibiliIdFromHtml(html);
    ogPatch.playback_mode = ogPatch.playback_mode || (platform === 'bilibili' ? 'embed' : 'external_url');
    ogPatch.playback_url = ogPatch.playback_url
      || (platform === 'bilibili' ? bilibiliEmbedUrl(workingUrl || sourceUrl, biliId) : sourceUrl);
  }
  result = mergeResult(result, ogPatch);

  if (!result.content_text && result.caption_text) {
    result.content_text = result.caption_text;
  }
  if (!result.summary_seed) {
    result.summary_seed = result.content_text.slice(0, 240) || result.title;
  }
  if (platform === 'bilibili' || platform === 'douyin') {
    const biliId = extractBilibiliId(workingUrl)
      || extractBilibiliId(sourceUrl)
      || extractBilibiliIdFromHtml(html);
    if (!result.title && biliId) {
      result = mergeResult(result, bilibiliFallback(workingUrl || sourceUrl, biliId));
    }
    // Keep empty caption when source has no description; UI shows 暂无文案.
    if (!cleanText(result.caption_text)) {
      result.caption_text = '';
    }
    result.content_text = usableText(result.content_text, result.title);
    if (!result.playback_url) {
      result.playback_mode = platform === 'bilibili' ? 'embed' : 'external_url';
      result.playback_url = platform === 'bilibili'
        ? bilibiliEmbedUrl(workingUrl || sourceUrl, biliId)
        : sourceUrl;
    }
  }
  result.quality = qualityFromText(result.content_text, result.title);
  return result;
}

export const LINK_BROWSER_UA = BROWSER_UA;
