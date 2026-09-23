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

async function fetchPageHtml(url) {
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
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
  if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/i.test(contentType)) {
    throw new Error(`不支持的内容类型：${contentType.split(';')[0]}`);
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_PAGE_BYTES) {
    throw new Error('页面过大（超过 2MB）');
  }
  const html = new TextDecoder('utf-8').decode(buf);
  if (!html.trim()) {
    throw new Error('页面内容为空');
  }
  return {
    url: target,
    finalUrl: response.url || target,
    html,
    contentType,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === 'PING') {
    sendResponse({ ok: true, version: '0.2.0' });
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
