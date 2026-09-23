const PLATFORM_DOMAINS = {
  xhs: ['.xiaohongshu.com', 'xiaohongshu.com'],
  douyin: ['.douyin.com', 'douyin.com', '.iesdouyin.com'],
  zhihu: ['.zhihu.com', 'zhihu.com'],
  bilibili: ['.bilibili.com', 'bilibili.com'],
};

const PLATFORM_HOME = {
  xhs: 'https://www.xiaohongshu.com/',
  douyin: 'https://www.douyin.com/',
  zhihu: 'https://www.zhihu.com/',
  bilibili: 'https://www.bilibili.com/',
};

const AUTH_HINTS = {
  xhs: ['web_session', 'a1'],
  douyin: ['sessionid', 'sessionid_ss'],
  zhihu: ['z_c0'],
  bilibili: ['SESSDATA', 'DedeUserID'],
};

const MAX_PAGE_BYTES = 2_000_000;
const TAB_TIMEOUT_MS = 28_000;
const TAB_SETTLE_MS = 1_600;

function cookiesToHeader(cookies) {
  const seen = new Map();
  for (const item of cookies || []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    seen.set(name, String(item.value || ''));
  }
  return Array.from(seen.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPlatformCookies(platform) {
  const code = String(platform || '').trim().toLowerCase();
  const domains = PLATFORM_DOMAINS[code];
  if (!domains) {
    throw new Error(`暂不支持平台：${platform}`);
  }
  const collected = [];
  for (const domain of domains) {
    const rows = await chrome.cookies.getAll({ domain });
    collected.push(...rows);
  }
  const header = cookiesToHeader(collected);
  const hints = AUTH_HINTS[code] || [];
  const hasAuth = hints.some((name) => header.includes(`${name}=`));
  if (!header || !hasAuth) {
    throw new Error('未检测到登录态。请先在本机浏览器打开并登录该平台，再回到拾藏点击连接。');
  }
  return {
    platform: code,
    cookies: header,
    cookie_items: collected.map((item) => ({
      name: item.name,
      value: item.value,
      domain: item.domain,
      path: item.path || '/',
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      expirationDate: item.expirationDate,
    })),
    ua: '',
    home: PLATFORM_HOME[code],
  };
}

async function cookieHeaderForUrl(url) {
  try {
    const rows = await chrome.cookies.getAll({ url });
    return cookiesToHeader(rows);
  } catch {
    return '';
  }
}

function assertHttpUrl(url) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('仅支持 http/https 链接');
  }
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('链接无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('链接协议不受支持');
  }
  return target;
}

/**
 * Open a background tab, wait for load + SPA settle, scrape rendered HTML.
 * Uses the user's real browser cookies/JS — far more reliable than extension fetch
 * for WeChat / Douyin / Zhihu.
 */
async function fetchViaTab(url) {
  const target = assertHttpUrl(url);
  const tab = await chrome.tabs.create({ url: target, active: false });
  const tabId = tab.id;
  if (!tabId) {
    throw new Error('无法打开后台标签页');
  }

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('页面加载超时'));
      }, TAB_TIMEOUT_MS);

      function onUpdated(id, info) {
        if (id !== tabId) return;
        if (info.status === 'complete') {
          cleanup();
          resolve();
        }
      }

      function cleanup() {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
      // Already complete (cached / instant).
      chrome.tabs.get(tabId).then((row) => {
        if (row?.status === 'complete') {
          cleanup();
          resolve();
        }
      }).catch(() => {});
    });

    await sleep(TAB_SETTLE_MS);

    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        html: document.documentElement.outerHTML,
        title: document.title || '',
        finalUrl: location.href,
      }),
    });
    const result = injected?.[0]?.result;
    const html = String(result?.html || '');
    if (!html.trim()) {
      throw new Error('页面内容为空');
    }
    if (html.length > MAX_PAGE_BYTES) {
      throw new Error('页面过大（超过 2MB）');
    }
    return {
      url: target,
      finalUrl: String(result?.finalUrl || target),
      html,
      text: html,
      contentType: 'text/html',
      title: String(result?.title || ''),
      via: 'tab',
    };
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // tab may already be closed
    }
  }
}

/** Direct fetch with explicit Cookie header (for Zhihu JSON APIs). */
async function fetchUrl(url, { accept = '' } = {}) {
  const target = assertHttpUrl(url);
  const acceptHeader = String(accept || '').trim()
    || 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';
  const cookie = await cookieHeaderForUrl(target);
  const headers = {
    Accept: acceptHeader,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
  if (cookie) headers.Cookie = cookie;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'include',
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('页面抓取超时');
    throw new Error(err?.message || '页面抓取失败');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`页面返回 HTTP ${response.status}`);
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const wantsJson = /application\/json/i.test(acceptHeader);
  if (
    contentType
    && !wantsJson
    && !/text\/html|application\/xhtml|text\/plain|application\/xml|application\/json/i.test(contentType)
  ) {
    throw new Error(`不支持的内容类型：${contentType.split(';')[0]}`);
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_PAGE_BYTES) {
    throw new Error('页面过大（超过 2MB）');
  }
  const text = new TextDecoder('utf-8').decode(buf);
  if (!text.trim()) {
    throw new Error('页面内容为空');
  }
  return {
    url: target,
    finalUrl: response.url || target,
    html: text,
    text,
    contentType,
    via: 'fetch',
  };
}

async function fetchPageHtml(url) {
  // Prefer real browser tab (cookies + JS). Fall back to credentialed fetch.
  try {
    return await fetchViaTab(url);
  } catch (tabErr) {
    try {
      return await fetchUrl(url);
    } catch {
      throw tabErr;
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === 'PING') {
    sendResponse({ ok: true, version: '0.2.2' });
    return false;
  }
  if (type === 'GET_PLATFORM_SESSION') {
    readPlatformCookies(message.platform)
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (type === 'FETCH_PAGE') {
    fetchPageHtml(message.url)
      .then((page) => sendResponse({ ok: true, page }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (type === 'FETCH_URL') {
    fetchUrl(message.url, { accept: message.accept || '' })
      .then((page) => sendResponse({ ok: true, page }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }
  if (type === 'OPEN_PLATFORM_LOGIN') {
    const code = String(message.platform || '').trim().toLowerCase();
    const url = PLATFORM_HOME[code];
    if (!url) {
      sendResponse({ ok: false, error: '未知平台' });
      return false;
    }
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
