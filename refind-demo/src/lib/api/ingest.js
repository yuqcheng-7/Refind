import { supabase } from '../supabaseClient.js';
import { inferPlatformFromUrl } from './materials.js';
import {
  isLikelyExpiredSessionError,
  listPlatformConnections,
  markPlatformSessionInvalid,
  restoreParserSessionFromStore,
} from './platformConnections.js';
import { fetchLocalSessionHealth, fetchLocalSessionPresence } from './platformLogin.js';
import { fetchPageHtmlViaExtension, pingRefindExtension } from './platformExtension.js';
import { supportsRealLogin } from './platformSession.js';
import { extractLinkContent } from '../../../../supabase/functions/parse-material/extractLinkContent.js';

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
  image: 'image/png',
};

/** File picker accept list — HTML/HTM intentionally excluded. */
export const MATERIAL_UPLOAD_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.md',
  '.markdown',
  '.txt',
  '.pptx',
  '.ppt',
  '.xlsx',
  '.xls',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/markdown',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
].join(',');

const blockedExtensions = new Set(['html', 'htm', 'xhtml', 'shtml']);
const blockedMimeTypes = new Set(['text/html', 'application/xhtml+xml', 'application/html']);

const defaultPlatformParserUrl = 'http://127.0.0.1:8787';
const sessionPlatforms = new Set(['xhs', 'douyin', 'zhihu', 'bilibili', 'wechat_mp']);

export function inferMaterialInputType(file) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  if (blockedExtensions.has(extension) || blockedMimeTypes.has(String(file?.type || '').toLowerCase())) {
    return null;
  }

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
  return byMimeType[file?.type] || null;
}

export function isAllowedMaterialUploadFile(file) {
  return Boolean(inferMaterialInputType(file));
}

export function partitionMaterialUploadFiles(fileList) {
  const files = [...(fileList || [])];
  const allowed = [];
  const rejected = [];
  for (const file of files) {
    if (isAllowedMaterialUploadFile(file)) allowed.push(file);
    else rejected.push(file);
  }
  return { allowed, rejected };
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
  {
    listConnections = listPlatformConnections,
    fetchPresence = fetchLocalSessionPresence,
    fetchHealth = fetchLocalSessionHealth,
  } = {},
) {
  const platform = inferPlatformFromUrl(sourceUrl);
  if (!sessionPlatforms.has(platform)) return false;
  const rows = await listConnections();
  const connected = rows.some((row) => row.code === platform && row.connection?.status === 'connected');
  if (!connected) return false;
  const health = await fetchHealth();
  if (health?.verified && Object.prototype.hasOwnProperty.call(health.verified, platform)) {
    // soft_ok_cookie_shape still counts as verified:true on parser; only skip when false.
    return health.verified[platform] === true;
  }
  const presence = await fetchPresence();
  if (presence && !presence[platform]) return false;
  return true;
}

function isZhihuJunkPrefetch(data) {
  if (!data || data.platform !== 'zhihu') return false;
  const title = String(data.title || '');
  const content = String(data.content_text || data.caption_text || '');
  if (/没有知识存在的荒原|安全验证|请先登录|404\s*-\s*知乎|^知乎$/.test(title)) return true;
  if (content.length > 0 && content.length < 280 && /中文互联网高质量的问答社区/.test(content)) return true;
  return false;
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
      signal: AbortSignal.timeout(18_000),
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
    if (isZhihuJunkPrefetch(data)) {
      return {
        error: true,
        platform: 'zhihu',
        detail: useSavedSession
          ? '已使用本机知乎登录会话，但仍未能解析该链接。请确认链接可公开打开，或在设置页「重新连接」知乎后再试。'
          : '知乎需要登录态才能抓取。请在设置页连接知乎后重试。',
        session_mode: data.session_mode || (useSavedSession ? 'saved' : 'anonymous'),
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

export async function pollMaterialStatus(materialId, { intervalMs = 800, timeoutMs = 90_000 } = {}) {
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

async function prefetchViaExtension(sourceUrl) {
  const hasExt = await pingRefindExtension();
  if (!hasExt) return null;
  try {
    const page = await fetchPageHtmlViaExtension(sourceUrl);
    const extracted = await extractLinkContent({
      sourceUrl,
      resolvedUrl: page.finalUrl || sourceUrl,
      html: page.html,
      env: {},
      // Avoid Edge/HK network from the browser path; HTML is already local.
      fetchFn: async () => {
        throw new Error('skip-network');
      },
    });
    if (isZhihuJunkPrefetch(extracted)) {
      return {
        error: true,
        platform: 'zhihu',
        detail: '扩展已打开页面，但仍未读到可用正文（可能是登录墙或验证页）。',
        session_mode: 'extension',
      };
    }
    if (!(extracted.content_text || extracted.caption_text || extracted.title)) {
      return {
        error: true,
        platform: extracted.platform || '',
        detail: '扩展抓取了页面，但未提取到正文',
        session_mode: 'extension',
      };
    }
    return {
      ...extracted,
      session_mode: 'extension',
      used_saved_session: false,
    };
  } catch (err) {
    return {
      error: true,
      detail: err?.message || '扩展抓取页面失败',
      session_mode: 'extension',
    };
  }
}

export async function parseAndPollMaterial(materialId, { force = false, sourceUrl = '' } = {}) {
  const platform = sourceUrl ? inferPlatformFromUrl(sourceUrl) : '';
  let restored = false;
  if (sourceUrl && supportsRealLogin(platform)) {
    try {
      restored = await restoreParserSessionFromStore(platform);
    } catch {
      // Best-effort: still attempt parse with whatever session the parser has.
    }
  }
  // If we just re-pushed cookies, always ask parser to use them — don't depend on
  // listConnections reconcile timing (which previously flipped use_saved_session off).
  const useSavedSession = restored
    || (sourceUrl ? await shouldUseSavedSession(sourceUrl) : false);
  let prefetchedRaw = sourceUrl
    ? await prefetchLinkContent(sourceUrl, { useSavedSession })
    : null;

  // Hosted parser uses a datacenter IP; many CN sites / WeChat block it.
  // Prefer the user's browser network via 拾藏连接 for web + wechat, or when parser failed.
  if (sourceUrl && (platform === 'wechat_mp' || platform === 'web' || prefetchedRaw?.error)) {
    const viaExt = await prefetchViaExtension(sourceUrl);
    if (viaExt && !viaExt.error) {
      prefetchedRaw = viaExt;
    } else if (prefetchedRaw?.error && viaExt?.detail) {
      prefetchedRaw = {
        error: true,
        detail: `${prefetchedRaw.detail || '托管解析失败'}（浏览器抓取：${viaExt.detail}）`,
        session_mode: viaExt.session_mode || prefetchedRaw.session_mode,
      };
    }
  }

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
