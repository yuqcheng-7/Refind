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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === 'PING') {
    sendResponse({ ok: true, version: '0.1.0' });
    return false;
  }
  if (type === 'GET_PLATFORM_SESSION') {
    readPlatformCookies(message.platform)
      .then((session) => sendResponse({ ok: true, session }))
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
