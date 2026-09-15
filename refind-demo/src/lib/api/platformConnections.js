import { supabase } from '../supabaseClient.js';
import { formatRelativeDateTime } from '../formatTime.js';
import { logoutPlatformParser, fetchLocalSessionPresence } from './platformLogin.js';
import { encodeDevSession, supportsRealLogin } from './platformSession.js';

export const PLATFORM_CONNECTION_OPTIONS = [
  { code: 'xhs', name: '小红书' },
  { code: 'douyin', name: '抖音' },
  { code: 'zhihu', name: '知乎' },
  { code: 'bilibili', name: 'B 站' },
  { code: 'wechat_mp', name: '微信公众号' },
];

/** Soft TTL for platform sessions when platforms don't expose exact expiry. */
export const PLATFORM_SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const STATUS_LABEL_ZH = {
  connected: '已连接',
  disconnected: '未连接',
};

const DISCONNECTED_PATCH = {
  status: 'disconnected',
  encrypted_session: '',
  account_display_name: null,
  last_verified_at: null,
  expires_at: null,
};

function normalizeStatus(status) {
  return status === 'connected' ? 'connected' : 'disconnected';
}

export function isConnectionExpired(row, now = Date.now()) {
  if (!row) return false;
  if (row.status === 'expired') return true;
  if (row.status !== 'connected') return false;
  if (row.expires_at) {
    const expiresAt = Date.parse(row.expires_at);
    return Number.isFinite(expiresAt) && expiresAt <= now;
  }
  // Legacy rows without expires_at: fall back to last_verified_at + TTL.
  if (row.last_verified_at) {
    const verifiedAt = Date.parse(row.last_verified_at);
    return Number.isFinite(verifiedAt) && (verifiedAt + PLATFORM_SESSION_TTL_MS) <= now;
  }
  return false;
}

export function isLikelyExpiredSessionError(detail = '', { usedSavedSession = false } = {}) {
  if (!usedSavedSession) return false;
  const text = String(detail || '');
  return /登录|未登录|Cookie|会话|过期|重新连接|扫码|auth|expired|guest/i.test(text);
}

function mapConnection(row) {
  if (!row) return null;
  const status = normalizeStatus(row.status);
  const connected = status === 'connected';
  return {
    id: row.id,
    platform: row.platform_code,
    accountName: connected ? (row.account_display_name || '') : '',
    status,
    statusLabel: STATUS_LABEL_ZH[status],
    lastVerifiedAt: connected ? row.last_verified_at : null,
    lastVerifiedLabel: connected && row.last_verified_at
      ? formatRelativeDateTime(row.last_verified_at)
      : '',
    expiresAt: connected ? row.expires_at || null : null,
    updatedAt: row.updated_at,
  };
}

function toDisconnectedRow(row) {
  return {
    ...row,
    status: 'disconnected',
    account_display_name: null,
    last_verified_at: null,
    expires_at: null,
    encrypted_session: '',
  };
}

async function migrateExpiredConnections(rows) {
  const expiredRows = (rows || []).filter((row) => isConnectionExpired(row));
  if (!expiredRows.length) return rows || [];

  const expiredIds = expiredRows.map((row) => row.id).filter(Boolean);
  if (expiredIds.length) {
    const { error } = await supabase
      .from('platform_connections')
      .update(DISCONNECTED_PATCH)
      .in('id', expiredIds);
    if (error) throw error;
  }

  const expiredCodes = [...new Set(
    expiredRows
      .map((row) => row.platform_code)
      .filter((code) => supportsRealLogin(code)),
  )];
  await Promise.all(expiredCodes.map((code) => logoutPlatformParser(code)));

  const expiredIdSet = new Set(expiredIds);
  return (rows || []).map((row) => (
    expiredIdSet.has(row.id) || isConnectionExpired(row)
      ? toDisconnectedRow(row)
      : row
  ));
}

async function reconcileMissingLocalSessions(rows) {
  const presence = await fetchLocalSessionPresence();
  if (!presence) return rows || [];

  const missing = (rows || []).filter((row) => (
    row.status === 'connected'
    && supportsRealLogin(row.platform_code)
    && presence[row.platform_code] !== true
  ));
  if (!missing.length) return rows || [];

  const expiredIds = missing.map((row) => row.id).filter(Boolean);
  if (expiredIds.length) {
    const { error } = await supabase
      .from('platform_connections')
      .update(DISCONNECTED_PATCH)
      .in('id', expiredIds);
    if (error) throw error;
  }

  const idSet = new Set(expiredIds);
  return (rows || []).map((row) => (idSet.has(row.id) ? toDisconnectedRow(row) : row));
}

export async function listPlatformConnections({ reconcileLocal = true } = {}) {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('id, platform_code, account_display_name, status, last_verified_at, expires_at, updated_at')
    .order('platform_code', { ascending: true });
  if (error) throw error;

  let rows = await migrateExpiredConnections(data);
  if (reconcileLocal) {
    rows = await reconcileMissingLocalSessions(rows);
  }
  const byCode = new Map(rows.map((row) => [row.platform_code, mapConnection(row)]));
  return PLATFORM_CONNECTION_OPTIONS.map((option) => ({
    ...option,
    connection: byCode.get(option.code) || {
      platform: option.code,
      accountName: '',
      status: 'disconnected',
      statusLabel: STATUS_LABEL_ZH.disconnected,
      lastVerifiedAt: null,
      lastVerifiedLabel: '',
      expiresAt: null,
    },
  }));
}

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('请先登录');
  return user.id;
}

function parseSessionPayload(sessionPayload) {
  if (typeof sessionPayload === 'string') {
    const trimmed = sessionPayload.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  if (sessionPayload && typeof sessionPayload === 'object') return sessionPayload;
  return null;
}

function buildExpiresAt(fromMs = Date.now()) {
  return new Date(fromMs + PLATFORM_SESSION_TTL_MS).toISOString();
}

/**
 * Persist a real platform session for supported platforms (xhs / douyin).
 */
export async function connectPlatform(platformCode, { accountDisplayName, sessionPayload } = {}) {
  if (!supportsRealLogin(platformCode)) {
    throw new Error('该平台真实登录即将支持');
  }

  const parsed = parseSessionPayload(sessionPayload);
  if (!parsed) {
    throw new Error('缺少有效登录会话，请先完成扫码登录');
  }

  const userId = await getCurrentUserId();
  const fromPayload = typeof parsed.account_display_name === 'string'
    ? parsed.account_display_name.trim()
    : '';
  const displayName = String(accountDisplayName || fromPayload || '').trim();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert({
      user_id: userId,
      platform_code: platformCode,
      account_display_name: displayName || null,
      encrypted_session: encodeDevSession(parsed),
      status: 'connected',
      last_verified_at: now,
      expires_at: buildExpiresAt(),
    }, { onConflict: 'user_id,platform_code' })
    .select('id, platform_code, account_display_name, status, last_verified_at, expires_at, updated_at')
    .single();
  if (error) throw error;
  return mapConnection(data);
}

export async function reconnectPlatform(platformCode, options = {}) {
  return connectPlatform(platformCode, options);
}

export async function disconnectPlatform(platformCode) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('platform_connections')
    .update(DISCONNECTED_PATCH)
    .eq('user_id', userId)
    .eq('platform_code', platformCode)
    .select('id, platform_code, account_display_name, status, last_verified_at, expires_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapConnection(data) || {
    platform: platformCode,
    accountName: '',
    status: 'disconnected',
    statusLabel: STATUS_LABEL_ZH.disconnected,
    lastVerifiedAt: null,
    lastVerifiedLabel: '',
    expiresAt: null,
  };
}

/** Mark a platform disconnected after session auth failure / soft expiry. */
export async function markPlatformSessionInvalid(platformCode) {
  const result = await disconnectPlatform(platformCode);
  if (supportsRealLogin(platformCode)) {
    await logoutPlatformParser(platformCode);
  }
  return result;
}
