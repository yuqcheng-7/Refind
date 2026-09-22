import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./platformSession.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
  };
});

import { buildParserUrl, fetchLocalSessionPresence, pollPlatformLogin, startPlatformLogin } from './platformLogin.js';

describe('platformLogin client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds parser URLs from env base', () => {
    expect(buildParserUrl('http://127.0.0.1:8787', '/login')).toBe('http://127.0.0.1:8787/login');
    expect(buildParserUrl('http://127.0.0.1:8787/', '/login/abc')).toBe('http://127.0.0.1:8787/login/abc');
  });

  it('reads local session presence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: { xhs: true, douyin: false } }),
    }));
    await expect(fetchLocalSessionPresence({ parserBaseUrl: 'http://127.0.0.1:8787' }))
      .resolves
      .toEqual({ xhs: true, douyin: false });
  });

  it('starts login and polls status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login_id: 'lid-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          account_display_name: '知夏',
          session_payload: '{"cookies":"a=1"}',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const started = await startPlatformLogin('xhs', { parserBaseUrl: 'http://127.0.0.1:8787' });
    expect(started.loginId).toBe('lid-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/login',
      expect.objectContaining({ method: 'POST' }),
    );

    const polled = await pollPlatformLogin('lid-1', { parserBaseUrl: 'http://127.0.0.1:8787' });
    expect(polled.status).toBe('success');
    expect(polled.sessionPayload).toContain('cookies');
    expect(polled.qrImageBase64).toBe('');
  });

  it('surfaces parser unreachable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(startPlatformLogin('douyin', { parserBaseUrl: 'http://127.0.0.1:8787' }))
      .rejects
      .toThrow(/本机解析器|平台登录服务/);
  });
});
