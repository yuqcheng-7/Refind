import { supabase } from '../supabaseClient.js';
import { inferPlatformFromUrl } from './materials.js';
import {
  isLikelyExpiredSessionError,
  listPlatformConnections,
  markPlatformSessionInvalid,
} from './platformConnections.js';

const terminalStatuses = new Set(['ready', 'failed', 'link_only']);

const mimeByType = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  markdown: 'text/markdown',
  txt: 'text/plain',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  image: 'application/octet-stream',
};

const defaultPlatformParserUrl = 'http://127.0.0.1:8787';
const sessionPlatforms = new Set(['xhs', 'douyin', 'zhihu', 'bilibili', 'wechat_mp']);

export function inferMaterialInputType(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const byExtension = {
    pdf: 'pdf',
    doc: 'doc',
    docx: 'docx',
    md: 'markdown',
    markdown: 'markdown',
    txt: 'txt',
    pptx: 'pptx',
    ppt: 'pptx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    csv: 'csv',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    webp: 'image',
    gif: 'image',
    heic: 'image',
  };
  if (byExtension[extension]) return byExtension[extension];

  const byMimeType = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/markdown': 'markdown',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/webp': 'image',
    'image/gif': 'image',
    'image/heic': 'image',
  };
  return byMimeType[file.type] || 'txt';
}

export function buildMaterialStorageKey(userId, fileName) {
  const rawExt = String(fileName || '').split('.').pop()?.toLowerCase() || '';
  const ext = /^[a-z0-9]{1,12}$/.test(rawExt) ? rawExt : '';
  return `${userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
}

export async function uploadMaterialFile(userId, file) {
  const key = buildMaterialStorageKey(userId, file.name);
  const inputType = inferMaterialInputType(file);
  const contentType = file.type || mimeByType[inputType] || 'application/octet-stream';
  const { error } = await supabase.storage.from('materials').upload(key, file, {
    contentType,
    upsert: false,
  });
  if (error) {
    const message = /invalid key/i.test(error.message)
      ? '文件名包含不支持的字符，请重试（系统已改用安全存储名）'
      : (error.message || '文件上传失败');
    throw new Error(message);
  }
  return key;
}

export function getPlatformParserBaseUrl() {
  const configured = String(import.meta.env.VITE_PLATFORM_PARSER_URL || '').trim();
  return (configured || defaultPlatformParserUrl).replace(/\/$/, '');
}

export function buildPlatformParsePayload(sourceUrl, { useSavedSession = false } = {}) {
  return {
    url: sourceUrl,
    use_saved_session: Boolean(useSavedSession),
  };
}

export async function shouldUseSavedSession(
  sourceUrl,
  { listConnections = listPlatformConnections } = {},
) {
  const platform = inferPlatformFromUrl(sourceUrl);
  if (!sessionPlatforms.has(platform)) return false;
  const rows = await listConnections();
  return rows.some((row) => row.code === platform && row.connection?.status === 'connected');
}

/** Browser-side parse on the user's network (CN platforms reachable). */
export async function prefetchLinkContent(sourceUrl, { useSavedSession = false } = {}) {
  if (!sourceUrl) return null;
  const base = getPlatformParserBaseUrl();
  try {
    const response = await fetch(`${base}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPlatformParsePayload(sourceUrl, { useSavedSession })),
      signal: AbortSignal.timeout(45000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        error: true,
        platform: data?.platform || '',
        detail: data?.detail || `本地解析失败 (${response.status})`,
        session_mode: data?.session_mode || (useSavedSession ? 'saved' : 'anonymous'),
      };
    }
    if (!data || data.error) {
      return {
        error: true,
        platform: data?.platform || '',
        detail: data?.detail || '本地解析未返回内容',
        session_mode: data?.session_mode || (useSavedSession ? 'saved' : 'anonymous'),
      };
    }
    if (!(data.content_text || data.caption_text || data.title)) {
      return {
        error: true,
        platform: data.platform || '',
        detail: '本地解析未返回可用正文',
        session_mode: data.session_mode || (useSavedSession ? 'saved' : 'anonymous'),
      };
    }
    return data;
  } catch {
    return {
      error: true,
      detail: '无法连接本地解析器（请先运行 python3 tools/platform-parser/server.py）',
      session_mode: useSavedSession ? 'saved' : 'anonymous',
    };
  }
}

export async function invokeMaterialParse(materialId, { force = false, prefetched = null } = {}) {
  const { data, error } = await supabase.functions.invoke('parse-material', {
    body: { materialId, force, prefetched },
  });
  if (error) return { error, data };
  return { error: null, data };
}

export async function pollMaterialStatus(materialId, { intervalMs = 1000, timeoutMs = 120000 } = {}) {
  const startedAt = Date.now();
  while (true) {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .single();
    if (error) throw error;
    if (terminalStatuses.has(data.status)) return data;
    if (Date.now() - startedAt >= timeoutMs) throw new Error('资料解析超时，请稍后重试');
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}

export async function parseAndPollMaterial(materialId, { force = false, sourceUrl = '' } = {}) {
  const useSavedSession = sourceUrl ? await shouldUseSavedSession(sourceUrl) : false;
  const prefetchedRaw = sourceUrl
    ? await prefetchLinkContent(sourceUrl, { useSavedSession })
    : null;
  const prefetched = prefetchedRaw && !prefetchedRaw.error ? prefetchedRaw : null;
  const prefetchDetail = prefetchedRaw?.error ? prefetchedRaw.detail : '';

  if (
    useSavedSession
    && prefetchedRaw?.error
    && isLikelyExpiredSessionError(prefetchDetail, {
      usedSavedSession: prefetchedRaw.session_mode === 'saved' || useSavedSession,
    })
  ) {
    const platform = inferPlatformFromUrl(sourceUrl);
    try {
      await markPlatformSessionInvalid(platform);
    } catch {
      // Best-effort UI/DB sync; parsing error still surfaces below.
    }
  }

  const { error: invokeError, data } = await invokeMaterialParse(materialId, { force, prefetched });
  try {
    const row = await pollMaterialStatus(materialId);
    if (row.status === 'failed') {
      const detail = row.last_parse_error || data?.error || invokeError?.message || prefetchDetail || '解析失败';
      const err = new Error(detail);
      err.materialId = materialId;
      err.status = row.status;
      throw err;
    }
    if (row.status === 'link_only' && prefetchDetail) {
      await supabase
        .from('materials')
        .update({ last_parse_error: prefetchDetail })
        .eq('id', materialId);
      row.last_parse_error = prefetchDetail;
    }
    return row;
  } catch (pollError) {
    if (pollError?.materialId) throw pollError;
    if (invokeError) throw invokeError;
    if (prefetchDetail) {
      const err = new Error(prefetchDetail);
      err.materialId = materialId;
      throw err;
    }
    throw pollError;
  }
}
