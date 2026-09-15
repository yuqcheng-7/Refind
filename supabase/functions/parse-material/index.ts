import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.0.6';
import { isAllowedPublicUrl, isBlockedIpAddress } from './urlSafety.js';
import { extractDocumentText, OFFICE_PARSEABLE_TYPES } from './extractDocumentText.js';
import { extractLinkContent, LINK_BROWSER_UA } from './extractLinkContent.js';
import { invokeEmbedMaterial } from './embedHook.js';
import { chunkText } from '../_shared/chunkText.js';

const documentDeps = {
  JSZip,
  unpdf: { extractText, getDocumentProxy },
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};
const textFileTypes = new Set(['txt', 'markdown', 'csv']);
const maxUrlResponseBytes = 2 * 1024 * 1024;
const allowedUrlContentTypes = new Set(['text/html', 'text/plain', 'application/xhtml+xml']);
const maxFileBytes = 15 * 1024 * 1024;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

async function assertSafePublicUrl(value: string) {
  if (!isAllowedPublicUrl(value)) throw new Error('链接地址不允许访问');

  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedIpAddress(hostname)) return url;

  const addresses = await Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ]);
  const resolved = addresses.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!resolved.length || resolved.some(isBlockedIpAddress)) {
    throw new Error('链接地址不允许访问');
  }
  return url;
}

function assertAllowedUrlContentType(contentType: string | null) {
  const mimeType = contentType?.split(';', 1)[0].trim().toLowerCase();
  if (!mimeType || !allowedUrlContentTypes.has(mimeType)) {
    throw new Error('链接内容类型不受支持');
  }
}

async function readLimitedText(fetched: Response) {
  const contentLength = Number(fetched.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxUrlResponseBytes) {
    throw new Error('链接内容超过 2MB 限制');
  }

  const reader = fetched.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxUrlResponseBytes) {
      await reader.cancel();
      throw new Error('链接内容超过 2MB 限制');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchSafeUrl(sourceUrl: string) {
  let url = await assertSafePublicUrl(sourceUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const fetched = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': LINK_BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (![301, 302, 303, 307, 308].includes(fetched.status)) {
      return { response: fetched, finalUrl: url.href };
    }

    const location = fetched.headers.get('location');
    if (!location || redirects === 5) throw new Error('链接重定向次数过多');
    url = await assertSafePublicUrl(new URL(location, url).href);
  }
  throw new Error('链接重定向次数过多');
}

function asCleanString(value: unknown) {
  return typeof value === 'string' ? cleanText(value) : '';
}

function fromPrefetched(prefetched: Record<string, unknown> | null) {
  if (!prefetched) return null;
  const content = asCleanString(prefetched.content_text)
    || asCleanString(prefetched.caption_text)
    || asCleanString(prefetched.title);
  if (!content && !asCleanString(prefetched.title)) return null;
  return {
    platform: asCleanString(prefetched.platform),
    title: asCleanString(prefetched.title),
    author_name: asCleanString(prefetched.author_name),
    caption_text: asCleanString(prefetched.caption_text),
    subtitle_text: asCleanString(prefetched.subtitle_text),
    content_text: content,
    summary_seed: asCleanString(prefetched.summary) || content,
    playback_mode: asCleanString(prefetched.playback_mode) || null,
    playback_url: asCleanString(prefetched.playback_url),
    playback_embed_html: asCleanString(prefetched.playback_embed_html),
    quality: asCleanString(prefetched.quality) || 'partial',
    canonical_url: asCleanString(prefetched.canonical_url),
  };
}

function buildSummary(seed: string, text: string, title = '') {
  const value = cleanText(seed || text);
  const heading = cleanText(title);
  if (!value) return '暂无摘要';
  // Avoid presenting a bare title / BV placeholder as if it were an AI summary.
  if (heading && (value === heading || value === `B站视频 ${heading}`)) {
    return `「${heading}」已入库。源站简介有限，完整 AI 摘要将在正文更充足后生成。`;
  }
  if (/^B站视频\s+BV/i.test(value) && value.length < 40) {
    return '视频已入库。完整简介与 AI 摘要待源站数据可用后补全。';
  }
  return value.length > 140 ? `${value.slice(0, 140)}…` : value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return response({ error: 'Missing authorization' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response({ error: 'Unauthorized' }, 401);

  let materialId: string;
  let force = false;
  let prefetched: Record<string, unknown> | null = null;
  try {
    const body = await req.json();
    materialId = body.materialId;
    force = Boolean(body.force);
    prefetched = body.prefetched && typeof body.prefetched === 'object' ? body.prefetched : null;
  } catch {
    return response({ error: 'Invalid JSON body' }, 400);
  }
  if (!materialId) return response({ error: 'materialId is required' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: material, error: materialError } = await admin
    .from('materials')
    .select('*')
    .eq('id', materialId)
    .eq('user_id', user.id)
    .single();
  if (materialError || !material) return response({ error: 'Material not found' }, 404);

  // Only skip completed ready parses. link_only/failed must be re-runnable (retry).
  if (material.status === 'ready' && !force) {
    return response({ ok: true, status: material.status });
  }

  try {
    const { error: processingError } = await admin.from('materials').update({
      status: 'processing',
      last_parse_error: null,
    }).eq('id', material.id);
    if (processingError) throw processingError;

    let text = '';
    let title = material.title;
    let linkFields: Record<string, unknown> = {};
    if (material.source_url) {
      const local = fromPrefetched(prefetched);
      if (local) {
        text = local.content_text || '';
        title = title || local.title || material.source_url;
        linkFields = {
          platform_code: local.platform || material.platform_code,
          author_name: local.author_name || material.author_name,
          caption_text: local.caption_text || null,
          subtitle_text: local.subtitle_text || null,
          playback_mode: local.playback_mode,
          playback_url: local.playback_url || null,
          playback_embed_html: local.playback_embed_html || null,
          summary_seed: local.summary_seed,
          quality: local.quality,
          canonical_url: local.canonical_url || material.source_url,
        };
      } else {
        let html = '';
        let resolvedUrl = material.source_url;
        try {
          const { response: fetched, finalUrl } = await fetchSafeUrl(material.source_url);
          resolvedUrl = finalUrl || material.source_url;
          if (fetched.ok) {
            const contentType = fetched.headers.get('content-type');
            try {
              assertAllowedUrlContentType(contentType);
              html = await readLimitedText(fetched);
            } catch {
              // Still try platform APIs / OG-less metadata path.
            }
          }
        } catch {
          // Platform APIs may still succeed without HTML (e.g. Bilibili).
        }

        const extracted = await extractLinkContent({
          sourceUrl: material.source_url,
          resolvedUrl,
          html,
          env: {
            PLATFORM_PARSER_URL: Deno.env.get('PLATFORM_PARSER_URL') || '',
          },
        });
        text = extracted.content_text || '';
        title = title || extracted.title || material.source_url;
        linkFields = {
          platform_code: extracted.platform || material.platform_code,
          author_name: extracted.author_name || material.author_name,
          caption_text: extracted.caption_text || null,
          subtitle_text: extracted.subtitle_text || null,
          playback_mode: extracted.playback_mode,
          playback_url: extracted.playback_url || null,
          playback_embed_html: extracted.playback_embed_html || null,
          summary_seed: extracted.summary_seed,
          quality: extracted.quality,
          canonical_url: extracted.canonical_url || resolvedUrl,
        };
      }
    } else if (material.storage_object_key) {
      const { data: file, error } = await admin.storage.from('materials').download(material.storage_object_key);
      if (error || !file) throw error || new Error('文件下载失败');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > maxFileBytes) throw new Error('文件超过 15MB 限制');

      if (textFileTypes.has(material.input_type)) {
        text = cleanText(new TextDecoder().decode(bytes));
      } else if (OFFICE_PARSEABLE_TYPES.has(material.input_type)) {
        text = await extractDocumentText(material.input_type, bytes, documentDeps);
      } else if (material.input_type === 'doc') {
        text = await extractDocumentText('doc', bytes, documentDeps);
      } else if (material.input_type === 'image') {
        throw new Error('图片 OCR 即将支持，请稍后再试');
      } else {
        throw new Error(`暂不支持解析 ${material.input_type} 文件`);
      }
    } else {
      throw new Error('资料没有可解析的链接或文件');
    }
    if (!text) {
      if (material.source_url) {
        const hasPartial = Boolean(title && title !== material.source_url);
        const { error: linkOnlyError } = await admin.from('materials').update({
          title: title || material.source_url,
          summary: hasPartial
            ? '仅获取到标题等信息，正文暂不可用。'
            : '暂无法解析正文，已保存为仅链接。',
          content_excerpt: material.source_url,
          status: 'link_only',
          last_parse_error: '未提取到可用正文',
          platform_code: (linkFields.platform_code as string) || material.platform_code,
          author_name: (linkFields.author_name as string) || material.author_name,
          playback_mode: (linkFields.playback_mode as string) || null,
          playback_url: (linkFields.playback_url as string) || null,
          playback_embed_html: (linkFields.playback_embed_html as string) || null,
        }).eq('id', material.id);
        if (linkOnlyError) throw linkOnlyError;
        return response({ ok: true, status: 'link_only' });
      }
      throw new Error('未提取到可用正文');
    }

    const chunks = chunkText(text);
    const { error: deleteError } = await admin.from('material_chunks').delete().eq('material_id', material.id);
    if (deleteError) throw deleteError;
    const { error: chunksError } = await admin.from('material_chunks').insert(chunks.map((chunk, chunkIndex) => ({
      material_id: material.id,
      user_id: material.user_id,
      knowledge_base_id: material.knowledge_base_id,
      chunk_index: chunkIndex,
      ...chunk,
    })));
    if (chunksError) throw chunksError;

    const summarySeed = typeof linkFields.summary_seed === 'string' ? linkFields.summary_seed : '';
    const readyPatch: Record<string, unknown> = {
      title: title || material.file_name || material.source_url,
      content_text: text,
      content_excerpt: text.slice(0, 240),
      summary: buildSummary(summarySeed, text, typeof title === 'string' ? title : ''),
      status: 'ready',
      last_parse_error: null,
      parse_attempt_count: 0,
      platform_code: (linkFields.platform_code as string) || material.platform_code,
      author_name: (linkFields.author_name as string) || material.author_name,
      caption_text: (linkFields.caption_text as string) || null,
      subtitle_text: (linkFields.subtitle_text as string) || null,
      playback_mode: (linkFields.playback_mode as string) || null,
      playback_url: (linkFields.playback_url as string) || null,
      playback_embed_html: (linkFields.playback_embed_html as string) || null,
    };
    if (!material.canonical_url && linkFields.canonical_url) {
      readyPatch.canonical_url = linkFields.canonical_url;
    }
    const { error: updateError } = await admin.from('materials').update(readyPatch).eq('id', material.id);
    if (updateError) throw updateError;
    const embedPromise = invokeEmbedMaterial({
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      materialId: material.id,
    });
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const waitUntil = edgeRuntime?.waitUntil?.bind(edgeRuntime);
    if (typeof waitUntil === 'function') {
      waitUntil(embedPromise);
    } else {
      await embedPromise.catch(() => {});
    }
    return response({ ok: true, status: 'ready', quality: linkFields.quality || 'full' });
  } catch (error) {
    const attempts = material.parse_attempt_count + 1;
    const status = attempts >= 3 ? 'link_only' : 'failed';
    const message = error instanceof Error ? error.message : '解析失败';
    const { error: updateError } = await admin.from('materials').update({
      parse_attempt_count: attempts,
      last_parse_error: message,
      status,
    }).eq('id', material.id);
    if (updateError) return response({ error: updateError.message }, 500);
    return response({ ok: false, status, attempts, error: message });
  }
});
