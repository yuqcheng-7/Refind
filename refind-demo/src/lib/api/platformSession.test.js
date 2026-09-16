import { describe, expect, it } from 'vitest';
import {
  REAL_LOGIN_PLATFORMS,
  decodeDevSession,
  encodeDevSession,
  hasValidStoredSession,
  isNoLoginPlatform,
  sessionPayloadHasAuthCookies,
  supportsRealLogin,
} from './platformSession.js';

describe('platformSession', () => {
  it('encodes and decodes dev1 session payloads', () => {
    const payload = {
      cookies: 'a=1; b=2',
      ua: 'TestUA',
      captured_at: '2026-09-15T00:00:00.000Z',
    };
    const encoded = encodeDevSession(payload);
    expect(encoded.startsWith('dev1:')).toBe(true);
    expect(decodeDevSession(encoded)).toEqual(payload);
  });

  it('returns null for invalid encodings', () => {
    expect(decodeDevSession('')).toBeNull();
    expect(decodeDevSession('plain')).toBeNull();
    expect(decodeDevSession('dev1:!!!')).toBeNull();
  });

  it('lists real-login and no-login platforms', () => {
    expect(REAL_LOGIN_PLATFORMS).toEqual(['xhs', 'douyin', 'zhihu', 'bilibili']);
    expect(supportsRealLogin('xhs')).toBe(true);
    expect(supportsRealLogin('zhihu')).toBe(true);
    expect(supportsRealLogin('bilibili')).toBe(true);
    expect(supportsRealLogin('wechat_mp')).toBe(false);
    expect(isNoLoginPlatform('wechat_mp')).toBe(true);
    expect(isNoLoginPlatform('zhihu')).toBe(false);
  });

  it('rejects guest-only xhs sessions and accepts real auth cookies', () => {
    expect(sessionPayloadHasAuthCookies('xhs', { cookies: 'web_session=guest-only' })).toBe(false);
    expect(sessionPayloadHasAuthCookies('xhs', {
      cookies: `a1=${'x'.repeat(24)}; web_session=abc`,
    })).toBe(true);
    expect(sessionPayloadHasAuthCookies('zhihu', { cookies: `z_c0=${'y'.repeat(20)}` })).toBe(true);
  });

  it('rejects legacy demo sessions and empty cookie payloads', () => {
    const valid = encodeDevSession({ cookies: `z_c0=${'y'.repeat(20)}`, platform: 'zhihu' });
    expect(hasValidStoredSession({
      status: 'connected',
      platform_code: 'zhihu',
      encrypted_session: valid,
    })).toBe(true);
    expect(hasValidStoredSession({
      status: 'connected',
      encrypted_session: 'refind-demo-session-pending',
    })).toBe(false);
    expect(hasValidStoredSession({
      status: 'connected',
      encrypted_session: encodeDevSession({ cookies: '', platform: 'bilibili' }),
    })).toBe(false);
  });
});
