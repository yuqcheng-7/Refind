import { supabase } from '../supabaseClient.js';

const platformLabels = {
  web: '链接',
  xhs: '小红书',
  douyin: '抖音',
  wechat_mp: '微信',
  zhihu: '知乎',
  bilibili: 'B 站',
  note: '笔记',
  other: '其他',
};

function formatMaterialTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return '今天';
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function mapMaterial(row) {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    kind: row.input_type === 'link' ? 'link' : 'file',
    inputType: row.input_type,
    url: row.source_url,
    fileName: row.file_name,
    title: row.title || row.file_name || row.source_url || '未命名资料',
    source: platformLabels[row.platform_code] || platformLabels.other,
    platform: row.platform_code,
    tag: '待整理',
    time: formatMaterialTime(row.created_at),
    summary: row.summary || row.content_excerpt || '',
    body: row.content_text || '',
    status: row.status,
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
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (query?.trim()) request = request.ilike('title', `%${query.trim()}%`);
  if (platform && platform !== 'all') request = request.eq('platform_code', platform);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map(mapMaterial);
}

export async function createMaterialStub({
  knowledgeBaseId,
  inputType,
  sourceUrl,
  title,
  storageObjectKey,
  fileMimeType,
  fileSizeBytes,
} = {}) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('materials')
    .insert({
      user_id: userId,
      knowledge_base_id: knowledgeBaseId,
      input_type: inputType,
      source_url: sourceUrl || null,
      title: title || null,
      file_name: inputType === 'link' ? null : title || null,
      storage_object_key: storageObjectKey || null,
      file_mime_type: fileMimeType || null,
      file_size_bytes: fileSizeBytes || null,
      status: 'processing',
    })
    .select()
    .single();
  if (error) throw error;
  return mapMaterial(data);
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

  if (material.storage_object_key) {
    const { error: storageError } = await supabase.storage
      .from('materials')
      .remove([material.storage_object_key]);
    if (storageError) throw storageError;
  }
}
