import { supabase } from '../supabaseClient.js';
import { formatMaterialStatus, formatRelativeDateTime } from '../formatTime.js';
import { isHttpUrlLike } from '../extractUrlFromPaste.js';

const platformLabels = {
  web: '链接',
  xhs: '小红书',
  douyin: '抖音',
  wechat_mp: '微信',
  zhihu: '知乎',
  bilibili: 'B 站',
  note: '笔记',
  other: '链接',
};

const mainstreamPlatforms = new Set(['xhs', 'douyin', 'wechat_mp', 'zhihu', 'bilibili']);

const fileTypeLabels = {
  pdf: 'PDF',
  doc: 'Word',
  docx: 'Word',
  pptx: 'PPT',
  xlsx: 'Excel',
  markdown: 'Markdown',
  txt: 'TXT',
  csv: 'CSV',
  image: '图片',
  note: '笔记',
};

const materialSelect = '*, material_tag_relations(material_tags(id, name))';

export function inferPlatformFromUrl(sourceUrl) {
  if (!sourceUrl) return 'web';
  let hostname = '';
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    return 'web';
  }

  if (/(^|\.)xiaohongshu\.com$|(^|\.)xhslink\.com$/.test(hostname)) return 'xhs';
  if (/(^|\.)douyin\.com$|(^|\.)iesdouyin\.com$|(^|\.)v\.douyin\.com$/.test(hostname)) return 'douyin';
  if (/(^|\.)zhihu\.com$/.test(hostname)) return 'zhihu';
  if (/(^|\.)bilibili\.com$|(^|\.)b23\.tv$/.test(hostname)) return 'bilibili';
  if (/(^|\.)mp\.weixin\.qq\.com$/.test(hostname)) return 'wechat_mp';
  return 'web';
}

function readTags(row) {
  return (row.material_tag_relations || [])
    .map((relation) => relation.material_tags?.name)
    .filter(Boolean);
}

export function formatMaterialTypeLabel(row) {
  if (row.input_type === 'link') {
    return mainstreamPlatforms.has(row.platform_code)
      ? (platformLabels[row.platform_code] || '链接')
      : '链接';
  }
  return fileTypeLabels[row.input_type] || '文件';
}

/** Prefer a human title; never show bare http(s) URLs in the list. */
export function formatMaterialTitle(row) {
  const raw = String(row?.title || row?.file_name || '').trim();
  if (raw && !isHttpUrlLike(raw)) return raw;

  const sourceUrl = row?.source_url || row?.url || (isHttpUrlLike(raw) ? raw : '');
  const platform = row?.platform_code || row?.platform || inferPlatformFromUrl(sourceUrl);
  const platformName = platformLabels[platform] || '链接';

  if (!sourceUrl) return raw || '未命名资料';

  try {
    const url = new URL(sourceUrl);
    const path = decodeURIComponent(url.pathname || '');
    const bv = path.match(/\b(BV[\w]+)\b/i)?.[1];
    if (bv) return `${platformName}视频 ${bv}`;
    const parts = path.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    if (last && !/^\d+$/.test(last) && last.length >= 4 && last.length <= 80) {
      return last.replace(/[-_]+/g, ' ').trim() || `${platformName}资料`;
    }
    const host = url.hostname.replace(/^www\./, '');
    return `${platformName} · ${host}`;
  } catch {
    return `${platformName}资料`;
  }
}

export function mapMaterial(row) {
  const tags = readTags(row);
  const typeLabel = formatMaterialTypeLabel(row);
  const rawSummary = row.summary || row.content_excerpt || '';
  const summary = /已解析\s*\d+\s*个文本片段/.test(rawSummary)
    ? (row.content_excerpt || '正文已就绪，可在下方阅读。')
    : rawSummary;
  const platform = row.platform_code;
  const body = row.content_text || '';
  const caption = row.caption_text || '';
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    kind: row.input_type === 'link' ? 'link' : 'file',
    inputType: row.input_type,
    url: row.source_url,
    fileName: row.file_name,
    title: formatMaterialTitle(row),
    source: typeLabel,
    typeLabel,
    platform,
    tag: tags[0] || '',
    tags,
    tagsUserEdited: Boolean(row.tags_user_edited),
    time: formatRelativeDateTime(row.created_at),
    summary,
    body,
    // Do not silently fall back caption → body; preview handles empty caption.
    caption,
    subtitles: row.subtitle_text || '',
    playbackMode: row.playback_mode || '',
    playbackUrl: row.playback_url || '',
    playbackEmbedHtml: row.playback_embed_html || '',
    status: row.status,
    statusLabel: formatMaterialStatus(row.status),
    lastParseError: row.last_parse_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('请先登录');
  return user.id;
}

export async function listMaterials(knowledgeBaseId, { query, platform } = {}) {
  let request = supabase
    .from('materials')
    .select(materialSelect)
    .eq('knowledge_base_id', knowledgeBaseId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (query?.trim()) request = request.ilike('title', `%${query.trim()}%`);
  if (platform && platform !== 'all') request = request.eq('platform_code', platform);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map(mapMaterial);
}

export async function getMaterialById(id) {
  const { data, error } = await supabase
    .from('materials')
    .select(materialSelect)
    .eq('id', id)
    .neq('status', 'deleted')
    .maybeSingle();
  if (error) throw error;
  return data ? mapMaterial(data) : null;
}

export async function createMaterialStub({
  knowledgeBaseId,
  inputType,
  sourceUrl,
  title,
  storageObjectKey,
  fileMimeType,
  fileSizeBytes,
  platformCode,
} = {}) {
  const userId = await getCurrentUserId();
  const resolvedPlatform = platformCode
    || (inputType === 'link' ? inferPlatformFromUrl(sourceUrl) : 'web');
  const resolvedTitle = title && !isHttpUrlLike(title) ? title : null;
  const { data, error } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      knowledge_base_id: knowledgeBaseId,
      input_type: inputType,
      source_url: sourceUrl || null,
      title: resolvedTitle,
      file_name: inputType === 'link' ? null : title || null,
      storage_object_key: storageObjectKey || null,
      file_mime_type: fileMimeType || null,
      file_size_bytes: fileSizeBytes || null,
      platform_code: resolvedPlatform,
      status: 'processing',
    })
    .select(materialSelect)
    .single();
  if (error) throw error;
  return mapMaterial(data);
}

export async function moveMaterial(id, knowledgeBaseId) {
  const { data, error } = await supabase
    .from('materials')
    .update({ knowledge_base_id: knowledgeBaseId })
    .eq('id', id)
    .select(materialSelect)
    .single();
  if (error) throw error;
  return mapMaterial(data);
}

export async function listMaterialTags({ knowledgeBaseId } = {}) {
  const userId = await getCurrentUserId();
  let query = supabase
    .from('materials')
    .select('material_tag_relations(material_tags(id, name))')
    .eq('user_id', userId)
    .neq('status', 'deleted');
  if (knowledgeBaseId) {
    query = query.eq('knowledge_base_id', knowledgeBaseId);
  }
  const { data, error } = await query;
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    for (const rel of row.material_tag_relations || []) {
      const tag = rel.material_tags;
      if (tag?.id && tag?.name) map.set(tag.id, { id: tag.id, name: tag.name });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

export async function replaceMaterialTags(materialId, tagNames) {
  const userId = await getCurrentUserId();
  const names = [...new Set(
    (tagNames || [])
      .map((n) => String(n || '').trim().replace(/^#+/, '').trim())
      .filter(Boolean),
  )];

  const tagIds = [];
  for (const name of names) {
    const { data: existingTags, error: lookupError } = await supabase
      .from('material_tags')
      .select('id, name')
      .eq('user_id', userId)
      .eq('name', name)
      .limit(1);
    if (lookupError) throw lookupError;

    let tagId = existingTags?.[0]?.id;
    if (!tagId) {
      const { data: created, error: createError } = await supabase
        .from('material_tags')
        .insert({ user_id: userId, name })
        .select('id')
        .single();
      if (createError) throw createError;
      tagId = created.id;
    }
    tagIds.push(tagId);
  }

  const { error: clearError } = await supabase
    .from('material_tag_relations')
    .delete()
    .eq('material_id', materialId);
  if (clearError) throw clearError;

  if (tagIds.length) {
    const { error: linkError } = await supabase
      .from('material_tag_relations')
      .insert(tagIds.map((tag_id) => ({ material_id: materialId, tag_id })));
    if (linkError) throw linkError;
  }

  const { error: flagError } = await supabase
    .from('materials')
    .update({ tags_user_edited: true })
    .eq('id', materialId);
  if (flagError) throw flagError;

  return getMaterialById(materialId);
}

export async function deleteMaterial(id) {
  const { data: material, error: lookupError } = await supabase
    .from('materials')
    .select('storage_object_key')
    .eq('id', id)
    .single();
  if (lookupError) throw lookupError;

  const { error } = await supabase
    .from('materials')
    .update({ status: 'deleted' })
    .eq('id', id);
  if (error) throw error;

  // Soft-delete is enough for UI; storage cleanup can finish in the background.
  if (material.storage_object_key) {
    void supabase.storage.from('materials').remove([material.storage_object_key]);
  }
}
