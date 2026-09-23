const SOURCE_PAGE = 'refind-app';
const SOURCE_EXT = 'refind-extension';

function requestExtension(type, payload = {}, timeoutMs = 8000) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('未检测到拾藏连接扩展（超时）。请先安装扩展并硬刷新本页。'));
    }, timeoutMs);

    function onMessage(event) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE_EXT || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (!data.ok) {
        reject(new Error(data.error || '扩展请求失败'));
        return;
      }
      resolve(data);
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ source: SOURCE_PAGE, type, requestId, ...payload }, '*');
  });
}

export async function pingRefindExtension() {
  try {
    const data = await requestExtension('REFIND_PING', {}, 2500);
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

export async function openPlatformInExtension(platformCode) {
  await requestExtension('REFIND_OPEN_PLATFORM', { platform: platformCode }, 5000);
}

export async function fetchSessionFromExtension(platformCode) {
  const data = await requestExtension(
    'REFIND_GET_SESSION',
    { platform: platformCode },
    10000,
  );
  const session = data?.session;
  if (!session?.cookies) {
    throw new Error(data?.error || '扩展未返回登录 Cookie');
  }
  return {
    cookies: String(session.cookies || '').trim(),
    cookieItems: Array.isArray(session.cookie_items) ? session.cookie_items : [],
    ua: String(session.ua || globalThis.navigator?.userAgent || '').trim(),
    platform: session.platform || platformCode,
  };
}

export function buildSessionPayloadFromExtension(session) {
  return JSON.stringify({
    cookies: session.cookies,
    cookie_items: session.cookieItems || [],
    ua: session.ua || globalThis.navigator?.userAgent || '',
    captured_at: new Date().toISOString(),
    account_display_name: '',
  });
}
