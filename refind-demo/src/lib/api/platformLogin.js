function readParserBase(explicit) {
  const configured = String(explicit || import.meta.env.VITE_PLATFORM_PARSER_URL || '').trim();
  return configured.replace(/\/$/, '') || 'http://127.0.0.1:8787';
}

export function buildParserUrl(base, path) {
  const root = String(base || '').replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parserUnreachableError() {
  const hosted = Boolean(String(import.meta.env.VITE_PLATFORM_PARSER_URL || '').trim());
  return new Error(
    hosted
      ? '无法连接平台登录服务，请稍后重试。若持续失败，请联系管理员检查 parser 服务。'
      : '无法连接本机解析器。请先运行：python3 tools/platform-parser/server.py（需已 pip install playwright && playwright install chromium）',
  );
}

export async function fetchLocalSessionPresence({ parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  try {
    const response = await fetch(buildParserUrl(base, '/sessions'), {
      signal: AbortSignal.timeout(8000),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.sessions || typeof data.sessions !== 'object') {
      return null;
    }
    return data.sessions;
  } catch {
    // Parser offline: do not treat as "sessions cleared".
    return null;
  }
}

/** Live-check saved cookies against platform APIs. null = parser offline. */
export async function fetchLocalSessionHealth({ parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  try {
    const response = await fetch(buildParserUrl(base, '/sessions'), {
      signal: AbortSignal.timeout(12_000),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.sessions || typeof data.sessions !== 'object') {
      return null;
    }
    return {
      sessions: data.sessions,
      verified: data.verified && typeof data.verified === 'object' ? data.verified : {},
      accounts: data.accounts && typeof data.accounts === 'object' ? data.accounts : {},
      details: data.details && typeof data.details === 'object' ? data.details : {},
    };
  } catch {
    return null;
  }
}

export async function startPlatformLogin(platformCode, { parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  let response;
  try {
    response = await fetch(buildParserUrl(base, '/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: platformCode }),
    });
  } catch {
    throw parserUnreachableError();
  }
  const data = await readJson(response);
  if (!response.ok) {
    const raw = data?.error || '启动登录失败';
    if (raw === 'not found') {
      throw new Error('本机解析器未包含登录接口，请重启：python3 tools/platform-parser/server.py');
    }
    throw new Error(raw);
  }
  const loginId = data?.login_id;
  if (!loginId) throw new Error('解析器未返回 login_id');
  return { loginId, parserBaseUrl: base };
}

export async function pollPlatformLogin(loginId, { parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  let response;
  try {
    response = await fetch(buildParserUrl(base, `/login/${loginId}`));
  } catch {
    throw parserUnreachableError();
  }
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || '查询登录状态失败');
  }
  return {
    status: data?.status || 'failed',
    accountDisplayName: data?.account_display_name || '',
    sessionPayload: data?.session_payload || '',
    error: data?.error || '',
    qrImageBase64: data?.qr_image_base64 || '',
    progress: data?.progress || '',
  };
}

export async function assertLocalParserSession(platformCode, { parserBaseUrl } = {}) {
  const presence = await fetchLocalSessionPresence({ parserBaseUrl });
  if (presence === null) {
    throw new Error(
      '无法连接本机解析器。请先运行 python3 tools/platform-parser/server.py，并在登录窗口自动关闭后再返回拾藏。',
    );
  }
  if (!presence[platformCode]) {
    throw new Error(
      '本机未保存该平台登录会话。若已扫码，请勿手动关闭登录窗口，请重新点击「连接」并等待窗口自动关闭。',
    );
  }
}

export async function logoutPlatformParser(platformCode, { parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  try {
    await fetch(buildParserUrl(base, '/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: platformCode }),
    });
  } catch {
    // Best-effort local cleanup; DB disconnect still proceeds.
  }
}

/** Manually import a Cookie header into the local parser (Zhihu fallback). */
export async function importPlatformCookies(platformCode, cookieHeader, {
  parserBaseUrl,
  accountDisplayName = '',
} = {}) {
  const base = readParserBase(parserBaseUrl);
  let response;
  try {
    response = await fetch(buildParserUrl(base, '/sessions/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: platformCode,
        cookies: cookieHeader,
        account_display_name: accountDisplayName,
      }),
    });
  } catch {
    throw parserUnreachableError();
  }
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || '导入 Cookie 失败');
  }
  return {
    accountDisplayName: data?.account_display_name || '',
    verified: Boolean(data?.verified),
  };
}

export async function waitForPlatformLogin(platformCode, {
  parserBaseUrl,
  intervalMs = 800,
  timeoutMs = 180_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onUpdate,
} = {}) {
  const { loginId, parserBaseUrl: base } = await startPlatformLogin(platformCode, { parserBaseUrl });
  const started = Date.now();
  let sawQr = false;
  while (Date.now() - started < timeoutMs) {
    const snap = await pollPlatformLogin(loginId, { parserBaseUrl: base });
    if (snap?.qrImageBase64) sawQr = true;
    if (typeof onUpdate === 'function') {
      try {
        onUpdate(snap);
      } catch {
        // UI callback errors must not abort login polling.
      }
    }
    if (snap.status === 'success') {
      if (!snap.sessionPayload) throw new Error('登录成功但未返回会话，请重试');
      const sessions = await fetchLocalSessionPresence({ parserBaseUrl: base });
      if (sessions && !sessions[platformCode]) {
        throw new Error(
          '登录未完成：服务端未保存有效会话。请重新点击「连接」，用 App 扫码完成登录后再试。',
        );
      }
      return snap;
    }
    if (snap.status === 'failed' || snap.status === 'expired') {
      throw new Error(snap.error || (snap.status === 'expired' ? '登录超时，请重试' : '登录失败'));
    }
    // Poll faster until the QR appears, then ease off.
    await sleep(sawQr ? intervalMs : Math.min(intervalMs, 400));
  }
  throw new Error('登录超时，请重试');
}
