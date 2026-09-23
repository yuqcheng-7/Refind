import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateIn = vi.fn(() => Promise.resolve({ error: null }));
const updateEq2 = vi.fn(() => ({
  select: vi.fn(() => ({
    maybeSingle: vi.fn(async () => ({
      data: {
        id: 'row-1',
        platform_code: 'xhs',
        account_display_name: null,
        status: 'disconnected',
        last_verified_at: null,
        updated_at: '2026-09-15T00:00:00.000Z',
      },
      error: null,
    })),
  })),
}));
const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
const update = vi.fn((payload) => {
  if (payload?.status === 'disconnected' && Object.prototype.hasOwnProperty.call(payload, 'encrypted_session')) {
    return { in: updateIn, eq: updateEq1 };
  }
  return { in: updateIn, eq: updateEq1 };
});

const upsertSingle = vi.fn();
const upsertSelect = vi.fn(() => ({ single: upsertSingle }));
const upsert = vi.fn(() => ({ select: upsertSelect }));

const selectOrder = vi.fn();
const selectMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
const selectEq2 = vi.fn(() => ({ maybeSingle: selectMaybeSingle }));
const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
const select = vi.fn(() => ({
  order: selectOrder,
  eq: selectEq1,
}));

const from = vi.fn(() => ({
  select,
  upsert,
  update,
}));

vi.mock('../supabaseClient.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: (...args) => from(...args),
  },
}));

vi.mock('./platformLogin.js', () => ({
  logoutPlatformParser: vi.fn(async () => {}),
  importPlatformCookies: vi.fn(async () => ({ accountDisplayName: '知夏', verified: true })),
  fetchLocalSessionPresence: vi.fn(async () => ({
    xhs: true,
    douyin: true,
    zhihu: true,
    bilibili: true,
  })),
  fetchLocalSessionHealth: vi.fn(async () => ({
    sessions: {
      xhs: true,
      douyin: true,
      zhihu: true,
      bilibili: true,
    },
    verified: {
      xhs: true,
      douyin: true,
      zhihu: true,
      bilibili: true,
    },
    accounts: {},
    details: {},
  })),
  assertLocalParserSession: vi.fn(async () => {}),
}));

import {
  connectPlatform,
  isConnectionExpired,
  isLikelyExpiredSessionError,
  listPlatformConnections,
  markPlatformSessionInvalid,
  PLATFORM_SESSION_TTL_MS,
} from './platformConnections.js';
import { encodeDevSession } from './platformSession.js';
import { logoutPlatformParser, fetchLocalSessionHealth, importPlatformCookies } from './platformLogin.js';

describe('platform connection expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertSingle.mockResolvedValue({
      data: {
        id: 'row-1',
        platform_code: 'xhs',
        account_display_name: '知夏',
        status: 'connected',
        last_verified_at: '2026-09-15T00:00:00.000Z',
        updated_at: '2026-09-15T00:00:00.000Z',
        expires_at: new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString(),
      },
      error: null,
    });
  });

  it('detects expired rows by status or expires_at', () => {
    expect(isConnectionExpired({ status: 'expired' })).toBe(true);
    expect(isConnectionExpired({
      status: 'connected',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })).toBe(true);
    expect(isConnectionExpired({
      status: 'connected',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })).toBe(false);
    expect(isConnectionExpired({
      status: 'connected',
      expires_at: null,
      last_verified_at: new Date(Date.now() - PLATFORM_SESSION_TTL_MS - 1000).toISOString(),
    })).toBe(true);
  });

  it('lists expired connections as disconnected and clears them', async () => {
    selectOrder.mockResolvedValue({
      data: [{
        id: 'exp-1',
        platform_code: 'xhs',
        account_display_name: '旧账号',
        status: 'connected',
        last_verified_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        expires_at: '2026-09-02T00:00:00.000Z',
      }],
      error: null,
    });

    const rows = await listPlatformConnections();
    const xhs = rows.find((row) => row.code === 'xhs');
    expect(xhs.connection.status).toBe('disconnected');
    expect(xhs.connection.accountName).toBe('');
    expect(update).toHaveBeenCalled();
    expect(logoutPlatformParser).toHaveBeenCalledWith('xhs');
  });

  it('restores missing local sessions from stored cookies instead of disconnecting', async () => {
    fetchLocalSessionHealth.mockResolvedValueOnce({
      sessions: { xhs: false, douyin: true, zhihu: true, bilibili: true },
      verified: { xhs: false, douyin: true, zhihu: true, bilibili: true },
      accounts: {},
      details: { xhs: 'no_local_session' },
    });

    const validSession = encodeDevSession({
      cookies: `a1=${'x'.repeat(24)}; web_session=abc`,
      platform: 'xhs',
    });
    selectOrder.mockResolvedValue({
      data: [{
        id: 'row-xhs',
        platform_code: 'xhs',
        account_display_name: '知夏',
        status: 'connected',
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString(),
        encrypted_session: validSession,
      }],
      error: null,
    });
    selectMaybeSingle.mockResolvedValueOnce({
      data: {
        platform_code: 'xhs',
        status: 'connected',
        encrypted_session: validSession,
        account_display_name: '知夏',
        expires_at: new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString(),
        last_verified_at: new Date().toISOString(),
      },
      error: null,
    });

    const rows = await listPlatformConnections();
    expect(rows.find((row) => row.code === 'xhs').connection.status).toBe('connected');
    expect(importPlatformCookies).toHaveBeenCalledWith(
      'xhs',
      expect.stringContaining('web_session=abc'),
      expect.any(Object),
    );
    expect(logoutPlatformParser).not.toHaveBeenCalled();
  });

  it('disconnects legacy demo zhihu/bilibili rows even when parser is offline', async () => {
    fetchLocalSessionHealth.mockResolvedValueOnce(null);
    selectOrder.mockResolvedValue({
      data: [
        {
          id: 'row-zh',
          platform_code: 'zhihu',
          account_display_name: '演示账号',
          status: 'connected',
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString(),
          encrypted_session: 'refind-demo-session-pending',
        },
        {
          id: 'row-bili',
          platform_code: 'bilibili',
          account_display_name: '',
          status: 'connected',
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + PLATFORM_SESSION_TTL_MS).toISOString(),
          encrypted_session: 'refind-demo-session-pending',
        },
      ],
      error: null,
    });

    const rows = await listPlatformConnections();
    expect(rows.find((row) => row.code === 'zhihu').connection.status).toBe('disconnected');
    expect(rows.find((row) => row.code === 'bilibili').connection.status).toBe('disconnected');
    expect(update).toHaveBeenCalled();
  });

  it('sets expires_at when connecting', async () => {
    const sessionPayload = JSON.stringify({
      cookies: `a1=${'x'.repeat(24)}; web_session=abc`,
      platform: 'xhs',
    });
    await connectPlatform('xhs', {
      sessionPayload,
      accountDisplayName: '知夏',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'connected',
        encrypted_session: encodeDevSession(JSON.parse(sessionPayload)),
        expires_at: expect.any(String),
      }),
      { onConflict: 'user_id,platform_code' },
    );
    const expiresAt = Date.parse(upsert.mock.calls[0][0].expires_at);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('marks session invalid in DB without clearing shared parser cookies', async () => {
    await markPlatformSessionInvalid('douyin');
    expect(update).toHaveBeenCalled();
    expect(logoutPlatformParser).not.toHaveBeenCalled();
  });

  it('recognizes session auth failures without false positives', () => {
    expect(isLikelyExpiredSessionError('请重新连接抖音', { usedSavedSession: true })).toBe(true);
    expect(isLikelyExpiredSessionError('本机解析器还没有可用会话 Cookie', { usedSavedSession: true })).toBe(true);
    expect(isLikelyExpiredSessionError('网络超时', { usedSavedSession: true })).toBe(false);
    expect(isLikelyExpiredSessionError('请重新连接', { usedSavedSession: false })).toBe(false);
    expect(isLikelyExpiredSessionError(
      '已使用本机知乎登录会话，但仍未能解析该链接。请确认链接为专栏',
      { usedSavedSession: true },
    )).toBe(false);
    expect(isLikelyExpiredSessionError(
      '知乎需要登录态才能抓取。请在设置页连接知乎完成本机扫码登录后重试',
      { usedSavedSession: true },
    )).toBe(true);
  });
});
