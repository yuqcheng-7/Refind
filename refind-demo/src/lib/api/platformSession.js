const DEV_PREFIX = 'dev1:';

export const REAL_LOGIN_PLATFORMS = ['xhs', 'douyin'];

export function supportsRealLogin(platformCode) {
  return REAL_LOGIN_PLATFORMS.includes(String(platformCode || '').trim());
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
