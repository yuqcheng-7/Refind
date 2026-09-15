import { supabase } from '../supabaseClient.js';

export function assertDeletable(knowledgeBase) {
  if (knowledgeBase?.type === 'default') {
    throw new Error('默认知识库不能删除');
  }
}

export function filterKnowledgeBaseNames(names, query = '') {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return names;
  return names.filter((name) => String(name).toLowerCase().includes(needle));
}

function mapKnowledgeBase(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconKey: row.icon_key,
    type: row.type,
    isDefault: row.type === 'default',
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

export async function listKnowledgeBases() {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapKnowledgeBase);
}

export async function createKnowledgeBase({ name, description } = {}) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('knowledge_bases')
    .insert({
      user_id: userId,
      name: name?.trim(),
      description: description?.trim() || null,
      type: 'custom',
    })
    .select()
    .single();
  if (error) throw error;
  return mapKnowledgeBase(data);
}

export async function updateKnowledgeBase(id, patch = {}) {
  const updates = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;

  const { data, error } = await supabase
    .from('knowledge_bases')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapKnowledgeBase(data);
}

export async function deleteKnowledgeBase(id) {
  const { data: knowledgeBase, error: lookupError } = await supabase
    .from('knowledge_bases')
    .select('id, type')
    .eq('id', id)
    .single();
  if (lookupError) throw lookupError;
  assertDeletable(knowledgeBase);

  const { error } = await supabase
    .from('knowledge_bases')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
