const DEV_PREFIX = 'dev1:';

export const REAL_LOGIN_PLATFORMS = ['xhs', 'douyin', 'zhihu', 'bilibili'];

/** Platforms that parse without account login (UI: 无需登录). */
export const NO_LOGIN_PLATFORMS = ['wechat_mp'];

export function supportsRealLogin(platformCode) {
  return REAL_LOGIN_PLATFORMS.includes(String(platformCode || '').trim());
}

export function isNoLoginPlatform(platformCode) {
  return NO_LOGIN_PLATFORMS.includes(String(platformCode || '').trim());
}

export function encodeDevSession(payload) {
  const json = JSON.stringify(payload || {});
  if (typeof globalThis.btoa === 'function') {
    return `${DEV_PREFIX}${globalThis.btoa(unescape(encodeURIComponent(json)))}`;
  }
  return `${DEV_PREFIX}${Buffer.from(json, 'utf8').toString('base64')}`;
}

export function decodeDevSession(encoded) {
  const raw = String(encoded || '');
  if (!raw.startsWith(DEV_PREFIX)) return null;
  const body = raw.slice(DEV_PREFIX.length);
  try {
    let json;
    if (typeof globalThis.atob === 'function') {
      json = decodeURIComponent(escape(globalThis.atob(body)));
    } else {
      json = Buffer.from(body, 'base64').toString('utf8');
    }
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const LEGACY_DEMO_SESSION_MARKERS = new Set([
  'refind-demo-session-pending',
  'demo',
]);

function cookieValueFromPayload(decoded, name) {
  const target = String(name || '').trim();
  if (!decoded || !target) return '';
  const items = Array.isArray(decoded.cookie_items) ? decoded.cookie_items : [];
  for (const item of items) {
    if (String(item?.name || '').trim() === target) {
      return String(item?.value || '').trim();
    }
  }
  const header = typeof decoded.cookies === 'string' ? decoded.cookies : '';
  for (const part of header.split(';')) {
    const piece = part.trim();
    if (!piece.startsWith(`${target}=`)) continue;
    return piece.slice(target.length + 1).trim();
  }
  return '';
}

/** Platform-specific auth cookies — guest / partial sessions must not count as connected. */
export function sessionPayloadHasAuthCookies(platformCode, decoded) {
  if (!decoded || typeof decoded !== 'object') return false;
  const platform = String(platformCode || decoded.platform || '').trim();
  const header = typeof decoded.cookies === 'string' ? decoded.cookies : '';
  const hasAnyCookie = /=/.test(header)
    || (Array.isArray(decoded.cookie_items)
      && decoded.cookie_items.some((item) => String(item?.name || '').trim() && String(item?.value || '').length > 0));
  if (!hasAnyCookie) return false;

  if (platform === 'xhs') {
    // web_session alone is guest; real login sets a1 (and usually web_session).
    return cookieValueFromPayload(decoded, 'a1').length >= 20;
  }
  if (platform === 'douyin') {
    return cookieValueFromPayload(decoded, 'sessionid').length >= 8
      || cookieValueFromPayload(decoded, 'sessionid_ss').length >= 8;
  }
  if (platform === 'zhihu') {
    return cookieValueFromPayload(decoded, 'z_c0').length >= 16;
  }
  if (platform === 'bilibili') {
    return cookieValueFromPayload(decoded, 'SESSDATA').length >= 16
      && cookieValueFromPayload(decoded, 'DedeUserID').length >= 1;
  }
  return hasAnyCookie;
}

/** True when a connected row has a real dev1 session with cookie payload. */
export function hasValidStoredSession(row) {
  if (!row || row.status !== 'connected') return true;
  const raw = String(row.encrypted_session || '').trim();
  if (!raw || LEGACY_DEMO_SESSION_MARKERS.has(raw)) return false;
  if (!raw.startsWith(DEV_PREFIX)) return false;
  const decoded = decodeDevSession(raw);
  if (!decoded) return false;
  return sessionPayloadHasAuthCookies(row.platform_code, decoded);
}
