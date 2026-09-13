import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAllowedPublicUrl, isBlockedIpAddress } from './urlSafety.js';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};
const textFileTypes = new Set(['txt', 'markdown', 'csv']);
const maxUrlResponseBytes = 2 * 1024 * 1024;
const allowedUrlContentTypes = new Set(['text/html', 'text/plain', 'application/xhtml+xml']);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function extractHtmlText(html: string) {
  return cleanText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  );
}

function getHtmlTitle(html: string) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? cleanText(match[1]) : null;
}

function chunkText(text: string, size = 1200) {
  const chunks: { content: string; source_start: number; source_end: number }[] = [];
  for (let start = 0; start < text.length; start += size) {
    const end = Math.min(start + size, text.length);
    chunks.push({ content: text.slice(start, end), source_start: start, source_end: end });
  }
  return chunks;
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
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const fetched = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (![301, 302, 303, 307, 308].includes(fetched.status)) return fetched;

    const location = fetched.headers.get('location');
    if (!location || redirects === 3) throw new Error('链接重定向次数过多');
    url = await assertSafePublicUrl(new URL(location, url).href);
  }
  throw new Error('链接重定向次数过多');
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
  try {
    ({ materialId } = await req.json());
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

  if (material.status === 'ready' || material.status === 'link_only') {
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
    if (material.source_url) {
      const fetched = await fetchSafeUrl(material.source_url);
      if (!fetched.ok) throw new Error(`链接获取失败 (${fetched.status})`);
      assertAllowedUrlContentType(fetched.headers.get('content-type'));
      const html = await readLimitedText(fetched);
      text = extractHtmlText(html);
      title ||= getHtmlTitle(html);
    } else if (material.storage_object_key) {
      if (!textFileTypes.has(material.input_type)) {
        throw new Error(`Phase 2 暂不支持解析 ${material.input_type} 文件`);
      }
      const { data: file, error } = await admin.storage.from('materials').download(material.storage_object_key);
      if (error || !file) throw error || new Error('文件下载失败');
      text = cleanText(await file.text());
    } else {
      throw new Error('资料没有可解析的链接或文件');
    }
    if (!text) throw new Error('未提取到可用正文');

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

    const { error: updateError } = await admin.from('materials').update({
      title: title || material.file_name || material.source_url,
      content_text: text,
      content_excerpt: text.slice(0, 240),
      summary: `已解析 ${chunks.length} 个文本片段。`,
      status: 'ready',
      last_parse_error: null,
    }).eq('id', material.id);
    if (updateError) throw updateError;
    return response({ ok: true, status: 'ready' });
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
