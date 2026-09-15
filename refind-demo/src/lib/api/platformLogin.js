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
  return new Error(
    '无法连接本机解析器。请先运行：python3 tools/platform-parser/server.py（需已 pip install playwright && playwright install chromium）',
  );
}

export async function fetchLocalSessionPresence({ parserBaseUrl } = {}) {
  const base = readParserBase(parserBaseUrl);
  try {
    const response = await fetch(buildParserUrl(base, '/sessions'), {
      signal: AbortSignal.timeout(3000),
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
  };
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

export async function waitForPlatformLogin(platformCode, {
  parserBaseUrl,
  intervalMs = 1500,
  timeoutMs = 180_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const { loginId, parserBaseUrl: base } = await startPlatformLogin(platformCode, { parserBaseUrl });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snap = await pollPlatformLogin(loginId, { parserBaseUrl: base });
    if (snap.status === 'success') {
      if (!snap.sessionPayload) throw new Error('登录成功但未返回会话，请重试');
      return snap;
    }
    if (snap.status === 'failed' || snap.status === 'expired') {
      throw new Error(snap.error || (snap.status === 'expired' ? '登录超时，请重试' : '登录失败'));
    }
    await sleep(intervalMs);
  }
  throw new Error('登录超时，请重试');
}
