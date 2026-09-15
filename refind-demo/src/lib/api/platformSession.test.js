import { describe, expect, it } from 'vitest';
import {
  REAL_LOGIN_PLATFORMS,
  decodeDevSession,
  encodeDevSession,
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

  it('lists real-login platforms', () => {
    expect(REAL_LOGIN_PLATFORMS).toEqual(['xhs', 'douyin']);
    expect(supportsRealLogin('xhs')).toBe(true);
    expect(supportsRealLogin('zhihu')).toBe(false);
  });
});
