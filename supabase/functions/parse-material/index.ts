import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.0.6';
import { isAllowedPublicUrl, isBlockedIpAddress } from './urlSafety.js';
import { extractDocumentText, OFFICE_PARSEABLE_TYPES } from './extractDocumentText.js';
import { extractLinkContent, LINK_BROWSER_UA } from './extractLinkContent.js';
import { invokeEmbedMaterial } from './embedHook.js';
import { chunkText } from '../_shared/chunkText.js';
import { deepseekChat } from '../_shared/ai.ts';
import { enrichMaterialSummaryAndTags } from './enrichMaterial.js';
import { shouldReplaceTags } from './enrichment.js';
import { replaceMaterialTagRelations } from './applyTags.js';
import { buildPreviewObjectKey, convertOfficeToPdf } from './convertOffice.js';
import { extractImageContent } from './extractImageContent.js';
import { buildEmbeddedImagesAppendix, buildMarkdownDataImageAppendix } from './extractEmbeddedImages.js';
import {
  buildOcrBlocksFromPersisted,
  enrichContentWithInlineImages,
} from './inlineImageContent.js';
import { buildCoverObjectKey, pickOfficeCoverImage } from './materialCover.js';
import { persistRemoteCoverImage } from './persistRemoteCover.js';
import { persistRemoteInlineImages } from './persistRemoteInlineImages.js';

const documentDeps = {
  JSZip,
  unpdf: { extractText, getDocumentProxy },
};
const officePreviewTypes = new Set(['pptx', 'xlsx', 'docx']);


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

function cleanMultiline(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function appendSubtitleForRag(text: string, subtitle: string) {
  const body = cleanText(text);
  const comments = cleanText(subtitle);
  if (!comments) return body;
  if (body.includes('【评论摘录】')) return body;
  return `${body}\n\n【评论摘录】\n${comments}`.trim();
}

function mediaUrlsFromList(values: unknown) {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const url = cleanText(value);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= 10) break;
  }
  return out;
}

function mediaUrlsFromPrefetched(prefetched: Record<string, unknown> | null) {
  if (!prefetched) return [];
  return mediaUrlsFromList(prefetched.media_urls);
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
    cover_image_url: asCleanString(
      prefetched.cover_image_url || prefetched.cover || prefetched.thumbnail || prefetched.image,
    ),
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

function errorMessage(error: unknown, fallback = '解析失败') {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const maybe = error as { message?: unknown; error?: unknown; details?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message;
    if (typeof maybe.error === 'string' && maybe.error.trim()) return maybe.error;
    if (typeof maybe.details === 'string' && maybe.details.trim()) return maybe.details;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
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

  const wasReady = material.status === 'ready';
  const priorSummary = material.summary;
  const priorContentText = material.content_text;

  try {
    const { error: processingError } = await admin.from('materials').update({
      status: 'processing',
      last_parse_error: null,
    }).eq('id', material.id);
    if (processingError) throw processingError;

    let text = '';
    let title = material.title;
    let linkFields: Record<string, unknown> = {};
    let deferredImageOcr: null | (() => Promise<string>) = null;
    let deferredInlineImages: null | (() => Promise<string>) = null;
    let pendingMediaUrls: string[] = [];
    if (material.source_url) {
      const local = fromPrefetched(prefetched);
      if (local) {
        text = appendSubtitleForRag(local.content_text || '', local.subtitle_text || '');
        title = title || local.title || material.source_url;
        linkFields = {
          platform_code: local.platform || material.platform_code,
          author_name: local.author_name || material.author_name,
          caption_text: local.caption_text || null,
          subtitle_text: local.subtitle_text || null,
          cover_image_url: local.cover_image_url || null,
          playback_mode: local.playback_mode,
          playback_url: local.playback_url || null,
          playback_embed_html: local.playback_embed_html || null,
          summary_seed: local.summary_seed,
          quality: local.quality,
          canonical_url: local.canonical_url || material.source_url,
        };
        pendingMediaUrls = mediaUrlsFromPrefetched(prefetched);
        // Prefetch already has usable body: do NOT re-fetch the source page here.
        // CN login-walled sites (Zhihu etc.) often blow up Edge SSRF/HTML limits and
        // previously aborted the whole parse with an opaque "解析失败".
        const prefetchedReady = Boolean(text && text.length >= 40);
        if (!prefetchedReady && (!linkFields.cover_image_url || !pendingMediaUrls.length)) {
          try {
            let html = '';
            let resolvedUrl = material.source_url;
            try {
              const { response: fetched, finalUrl } = await fetchSafeUrl(material.source_url);
              resolvedUrl = finalUrl || material.source_url;
              if (fetched.ok) {
                try {
                  assertAllowedUrlContentType(fetched.headers.get('content-type'));
                  html = await readLimitedText(fetched);
                } catch {
                  // Platform APIs may still return cover without HTML.
                }
              }
            } catch {
              // continue with URL-only extract
            }
            const extracted = await extractLinkContent({
              sourceUrl: material.source_url,
              resolvedUrl,
              html,
              env: {
                PLATFORM_PARSER_URL: Deno.env.get('PLATFORM_PARSER_URL') || '',
              },
            });
            if (!linkFields.cover_image_url && extracted.cover_image_url) {
              linkFields.cover_image_url = extracted.cover_image_url;
            }
            if (!pendingMediaUrls.length) {
              pendingMediaUrls = mediaUrlsFromList(extracted.media_urls);
            }
          } catch (coverError) {
            console.error('cover supplement failed', errorMessage(coverError));
          }
        }
        // When prefetched is ready, still allow parser-only cover fill (no page fetch).
        if (prefetchedReady && !linkFields.cover_image_url) {
          try {
            const extracted = await extractLinkContent({
              sourceUrl: material.source_url,
              resolvedUrl: material.source_url,
              html: '',
              env: {
                PLATFORM_PARSER_URL: Deno.env.get('PLATFORM_PARSER_URL') || '',
              },
              fetchFn: async (input: RequestInfo | URL, init?: RequestInit) => {
                const href = String(input);
                // Only allow the hosted parser; block accidental source-site fetches.
                const parserBase = String(Deno.env.get('PLATFORM_PARSER_URL') || '');
                if (parserBase && href.startsWith(parserBase)) {
                  return fetch(input, init);
                }
                throw new Error('skip-source-fetch');
              },
            });
            if (extracted.cover_image_url) {
              linkFields.cover_image_url = extracted.cover_image_url;
            }
            if (!pendingMediaUrls.length) {
              pendingMediaUrls = mediaUrlsFromList(extracted.media_urls);
            }
          } catch (coverError) {
            console.error('parser cover fill failed', errorMessage(coverError));
          }
        }
        if (pendingMediaUrls.length) {
          if (!text || text.length < 40) {
            text = text || '【笔记说明】正文主要为图片，文内图片识别将在后台补充。';
          }
        }
      } else {
        let html = '';
        let resolvedUrl = material.source_url;
        const platformHint = String(material.platform_code || '');
        const skipHtmlFetch = ['zhihu', 'douyin', 'xhs', 'bilibili'].includes(platformHint);
        if (!skipHtmlFetch) {
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
        }

        let extracted;
        try {
          extracted = await extractLinkContent({
            sourceUrl: material.source_url,
            resolvedUrl,
            html,
            env: {
              PLATFORM_PARSER_URL: Deno.env.get('PLATFORM_PARSER_URL') || '',
            },
          });
        } catch (extractError) {
          throw new Error(`链接解析失败：${errorMessage(extractError)}`);
        }
        text = extracted.content_text || '';
        title = title || extracted.title || material.source_url;
        linkFields = {
          platform_code: extracted.platform || material.platform_code,
          author_name: extracted.author_name || material.author_name,
          caption_text: extracted.caption_text || null,
          subtitle_text: extracted.subtitle_text || null,
          cover_image_url: extracted.cover_image_url || null,
          playback_mode: extracted.playback_mode,
          playback_url: extracted.playback_url || null,
          playback_embed_html: extracted.playback_embed_html || null,
          summary_seed: extracted.summary_seed,
          quality: extracted.quality,
          canonical_url: extracted.canonical_url || resolvedUrl,
        };
        pendingMediaUrls = mediaUrlsFromList(extracted.media_urls);
      }

      if (pendingMediaUrls.length) {
        const mediaUrls = pendingMediaUrls;
        deferredInlineImages = async () => {
          const persisted = await persistRemoteInlineImages({
            admin,
            userId: material.user_id,
            materialId: material.id,
            mediaUrls,
            referer: material.source_url || '',
            userAgent: LINK_BROWSER_UA,
          });
          const ocrBlocks = await buildOcrBlocksFromPersisted({
            persisted,
            extractImageContent,
            dashscopeKey: Deno.env.get('DASHSCOPE_API_KEY') || '',
          });
          const { data: latest, error: latestError } = await admin
            .from('materials')
            .select('content_text')
            .eq('id', material.id)
            .maybeSingle();
          if (latestError) throw latestError;
          const base = String(latest?.content_text || text || '').trim();
          if (!base || base.includes('【文内图片识别】')) return '';
          if (!persisted.length && !ocrBlocks.length) return '';
          return enrichContentWithInlineImages({
            baseText: base,
            persisted,
            ocrBlocks,
          });
        };
      }
    } else if (material.storage_object_key) {
      const { data: file, error } = await admin.storage.from('materials').download(material.storage_object_key);
      if (error || !file) throw error || new Error('文件下载失败');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > maxFileBytes) throw new Error('文件超过 15MB 限制');

      if (textFileTypes.has(material.input_type)) {
        text = cleanMultiline(new TextDecoder().decode(bytes));
        // Defer markdown data-URI OCR so parse returns quickly.
        deferredImageOcr = async () => buildMarkdownDataImageAppendix({
          text,
          extractImageContent,
          dashscopeKey: Deno.env.get('DASHSCOPE_API_KEY') || '',
        });
      } else if (OFFICE_PARSEABLE_TYPES.has(material.input_type)) {
        text = await extractDocumentText(material.input_type, bytes, documentDeps);
        if (material.input_type === 'docx' || material.input_type === 'pptx' || material.input_type === 'xlsx') {
          // Defer embedded-image OCR; main text path should stay fast.
          deferredImageOcr = async () => buildEmbeddedImagesAppendix({
            inputType: material.input_type,
            bytes,
            JSZip,
            extractImageContent,
            dashscopeKey: Deno.env.get('DASHSCOPE_API_KEY') || '',
          });
        }
        if (!text) {
          if (deferredImageOcr) {
            text = '【文档说明】正文主要为图片，文内图片识别将在后台补充。';
          } else {
            throw new Error('未提取到可用正文');
          }
        }
      } else if (material.input_type === 'doc') {
        text = await extractDocumentText('doc', bytes, documentDeps);
      } else if (material.input_type === 'image') {
        const extracted = await extractImageContent({
          bytes,
          fileName: material.file_name || '',
          mimeType: material.file_mime_type || '',
          dashscopeKey: Deno.env.get('DASHSCOPE_API_KEY') || '',
        });
        text = extracted.content_text || '';
        if (extracted.description) {
          linkFields.summary_seed = extracted.description;
        }
        if (material.storage_object_key) {
          linkFields.cover_storage_object_key = material.storage_object_key;
        }
      } else {
        throw new Error(`暂不支持解析 ${material.input_type} 文件`);
      }

      if (
        !linkFields.cover_storage_object_key
        && (material.input_type === 'docx' || material.input_type === 'pptx' || material.input_type === 'xlsx')
        && material.storage_object_key
      ) {
        try {
          const cover = await pickOfficeCoverImage(material.input_type, bytes, JSZip);
          if (cover?.bytes?.byteLength) {
            const coverKey = buildCoverObjectKey(material.storage_object_key, cover.ext);
            const { error: coverUploadError } = await admin.storage.from('materials').upload(
              coverKey,
              cover.bytes,
              { contentType: cover.mimeType, upsert: true },
            );
            if (!coverUploadError) {
              linkFields.cover_storage_object_key = coverKey;
            }
          }
        } catch (coverError) {
          console.error('office cover extract failed', coverError);
        }
      }

      if (officePreviewTypes.has(material.input_type)) {
        const convertBase = Deno.env.get('OFFICE_CONVERT_URL')
          || Deno.env.get('PLATFORM_PARSER_URL')
          || '';
        // Skip unreachable localhost from Edge; only call hosted convertors.
        const looksLocal = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(convertBase.trim());
        if (convertBase && !looksLocal) {
          try {
            const converted = await convertOfficeToPdf({
              convertUrl: convertBase,
              engine: Deno.env.get('OFFICE_CONVERT_ENGINE') || '',
              filename: material.file_name || `${material.id}.${material.input_type}`,
              bytes,
            });
            if (converted?.bytes?.byteLength) {
              const previewKey = buildPreviewObjectKey(material.storage_object_key);
              const { error: uploadError } = await admin.storage.from('materials').upload(
                previewKey,
                converted.bytes,
                { contentType: 'application/pdf', upsert: true },
              );
              if (!uploadError) {
                linkFields.preview_storage_object_key = previewKey;
              }
            }
          } catch (convertError) {
            console.error('office preview convert failed', convertError);
          }
        }
      }
    } else {
      throw new Error('资料没有可解析的链接或文件');
    }
    if (!text) {
      if (material.source_url) {
        if (wasReady) {
          const { error: restoreError } = await admin.from('materials').update({
            status: 'ready',
            summary: priorSummary,
            content_text: priorContentText,
            last_parse_error: '未提取到可用正文（已保留原 ready 结果）',
            platform_code: (linkFields.platform_code as string) || material.platform_code,
            author_name: (linkFields.author_name as string) || material.author_name,
          }).eq('id', material.id);
          if (restoreError) throw restoreError;
          return response({ ok: true, status: 'ready', preserved: true });
        }
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
          cover_image_url: (linkFields.cover_image_url as string) || material.cover_image_url || null,
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
    const stubSummary = buildSummary(summarySeed, text, typeof title === 'string' ? title : '');
    const readyPatch: Record<string, unknown> = {
      title: title || material.file_name || material.source_url,
      content_text: text,
      content_excerpt: text.slice(0, 240),
      summary: stubSummary,
      status: 'ready',
      last_parse_error: null,
      parse_attempt_count: 0,
      platform_code: (linkFields.platform_code as string) || material.platform_code,
      author_name: (linkFields.author_name as string) || material.author_name,
      caption_text: (linkFields.caption_text as string) || null,
      subtitle_text: (linkFields.subtitle_text as string) || null,
      cover_image_url: (linkFields.cover_image_url as string)
        || material.cover_image_url
        || null,
      playback_mode: (linkFields.playback_mode as string) || null,
      playback_url: (linkFields.playback_url as string) || null,
      playback_embed_html: (linkFields.playback_embed_html as string) || null,
    };
    if (!material.canonical_url && linkFields.canonical_url) {
      readyPatch.canonical_url = linkFields.canonical_url;
    }
    if (typeof linkFields.preview_storage_object_key === 'string' && linkFields.preview_storage_object_key) {
      readyPatch.preview_storage_object_key = linkFields.preview_storage_object_key;
    }
    if (typeof linkFields.cover_storage_object_key === 'string' && linkFields.cover_storage_object_key) {
      readyPatch.cover_storage_object_key = linkFields.cover_storage_object_key;
    } else if (
      typeof linkFields.cover_image_url === 'string'
      && linkFields.cover_image_url
      && material.source_url
    ) {
      try {
        const persistedCover = await persistRemoteCoverImage({
          admin,
          userId: material.user_id,
          materialId: material.id,
          coverUrl: linkFields.cover_image_url as string,
          referer: material.source_url,
        });
        if (persistedCover) {
          readyPatch.cover_storage_object_key = persistedCover;
        }
      } catch (coverPersistError) {
        console.error('cover persist failed', errorMessage(coverPersistError));
      }
    }
    const { error: updateError } = await admin.from('materials').update(readyPatch).eq('id', material.id);
    if (updateError) {
      const msg = errorMessage(updateError);
      // Soft-launch / retries often leave deleted rows that still occupy canonical_url.
      if (/materials_unique_canonical_url|canonical_url/i.test(msg) && readyPatch.canonical_url) {
        const { canonical_url: _drop, ...withoutCanonical } = readyPatch;
        const { error: retryError } = await admin.from('materials').update(withoutCanonical).eq('id', material.id);
        if (retryError) throw retryError;
      } else {
        throw updateError;
      }
    }

    const embedPromise = invokeEmbedMaterial({
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      materialId: material.id,
    });

    const backgroundEnrichment = (async () => {
      await embedPromise.catch((error) => {
        console.error('embed after parse failed', error);
      });

      try {
        const enrichment = await enrichMaterialSummaryAndTags({
          deepseekChat,
          title: typeof title === 'string' ? title : '',
          platform: (linkFields.platform_code as string) || material.platform_code || 'web',
          contentText: text,
        });
        if (enrichment.summary) {
          const { error: summaryError } = await admin.from('materials').update({
            summary: enrichment.summary,
          }).eq('id', material.id);
          if (summaryError) console.error('summary patch failed', summaryError);
        }
        if (
          shouldReplaceTags({ tagsUserEdited: Boolean(material.tags_user_edited) })
          && enrichment.tags
          && enrichment.tags.length > 0
        ) {
          try {
            await replaceMaterialTagRelations(admin, {
              userId: material.user_id,
              materialId: material.id,
              tagNames: enrichment.tags,
            });
          } catch (tagError) {
            console.error('apply tags failed', tagError);
          }
        }
      } catch (aiError) {
        console.error('deferred enrichment failed', aiError);
      }

      if (deferredInlineImages) {
        try {
          const enriched = String(await deferredInlineImages() || '').trim();
          if (enriched) {
            const { error: patchError } = await admin.from('materials').update({
              content_text: enriched,
              content_excerpt: enriched.slice(0, 240),
            }).eq('id', material.id);
            if (patchError) throw patchError;

            const nextChunks = chunkText(enriched);
            const { error: deleteChunksError } = await admin
              .from('material_chunks')
              .delete()
              .eq('material_id', material.id);
            if (deleteChunksError) throw deleteChunksError;
            if (nextChunks.length) {
              const { error: insertChunksError } = await admin.from('material_chunks').insert(
                nextChunks.map((chunk, chunkIndex) => ({
                  material_id: material.id,
                  user_id: material.user_id,
                  knowledge_base_id: material.knowledge_base_id,
                  chunk_index: chunkIndex,
                  ...chunk,
                })),
              );
              if (insertChunksError) throw insertChunksError;
            }
            await invokeEmbedMaterial({
              supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
              serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
              materialId: material.id,
            });
          }
        } catch (imageError) {
          console.error('deferred inline image enrichment failed', imageError);
        }
        return;
      }

      if (!deferredImageOcr) return;
      try {
        const appendix = String(await deferredImageOcr() || '').trim();
        if (!appendix) return;
        const { data: latest, error: latestError } = await admin
          .from('materials')
          .select('content_text')
          .eq('id', material.id)
          .maybeSingle();
        if (latestError) throw latestError;
        const base = String(latest?.content_text || text || '').trim();
        if (!base || base.includes('【文内图片识别】')) return;
        const full = `${base}\n\n${appendix}`.trim();
        const { error: patchError } = await admin.from('materials').update({
          content_text: full,
          content_excerpt: full.slice(0, 240),
        }).eq('id', material.id);
        if (patchError) throw patchError;

        const nextChunks = chunkText(full);
        const { error: deleteChunksError } = await admin
          .from('material_chunks')
          .delete()
          .eq('material_id', material.id);
        if (deleteChunksError) throw deleteChunksError;
        if (nextChunks.length) {
          const { error: insertChunksError } = await admin.from('material_chunks').insert(
            nextChunks.map((chunk, chunkIndex) => ({
              material_id: material.id,
              user_id: material.user_id,
              knowledge_base_id: material.knowledge_base_id,
              chunk_index: chunkIndex,
              ...chunk,
            })),
          );
          if (insertChunksError) throw insertChunksError;
        }
        await invokeEmbedMaterial({
          supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
          serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
          materialId: material.id,
        });
      } catch (imageError) {
        console.error('deferred embedded image OCR failed', imageError);
      }
    })();

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const waitUntil = edgeRuntime?.waitUntil?.bind(edgeRuntime);
    if (typeof waitUntil === 'function') {
      waitUntil(backgroundEnrichment);
    } else {
      // Local/tests: still return ready quickly; enrichment continues without blocking caller hard.
      void backgroundEnrichment.catch(() => {});
    }
    return response({ ok: true, status: 'ready', quality: linkFields.quality || 'full' });
  } catch (error) {
    const message = errorMessage(error);
    console.error('parse-material failed', message, error);
    if (wasReady) {
      const { error: restoreError } = await admin.from('materials').update({
        status: 'ready',
        summary: priorSummary,
        content_text: priorContentText,
        last_parse_error: `${message}（已保留原 ready 结果）`,
      }).eq('id', material.id);
      if (restoreError) return response({ error: restoreError.message }, 500);
      return response({ ok: false, status: 'ready', preserved: true, error: message });
    }
    const attempts = material.parse_attempt_count + 1;
    const status = attempts >= 3 ? 'link_only' : 'failed';
    const { error: updateError } = await admin.from('materials').update({
      parse_attempt_count: attempts,
      last_parse_error: message,
      status,
    }).eq('id', material.id);
    if (updateError) return response({ error: updateError.message }, 500);
    return response({ ok: false, status, attempts, error: message });
  }
});
