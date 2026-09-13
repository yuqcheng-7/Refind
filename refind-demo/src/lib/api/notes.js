import { supabase } from '../supabaseClient.js';

const emptyContent = { text: '', blocks: [], sections: [] };

export function normalizeNoteContent(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content)
    ? content
    : {};

  return {
    ...value,
    text: typeof value.text === 'string' ? value.text : '',
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    sections: Array.isArray(value.sections) ? value.sections : [],
  };
}

function formatCardTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

export function mapNotebook(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapNote(row) {
  const relations = [...(row.note_inspiration_cards || [])]
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title || '未命名笔记',
    content: normalizeNoteContent(row.content || emptyContent),
    inspirationCardIds: relations.map((relation) => relation.inspiration_card_id),
    materialThoughts: Object.fromEntries(relations
      .filter((relation) => relation.user_thought != null)
      .map((relation) => [relation.inspiration_card_id, relation.user_thought])),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedLabel: formatCardTime(row.updated_at),
  };
}

export function mapInspirationCard(row) {
  const citations = Array.isArray(row.citation_snapshot) ? row.citation_snapshot : [];
  const citation = citations[0] || null;

  return {
    id: row.id,
    contentSnapshot: row.content_snapshot,
    questionSnapshot: row.source_question_snapshot || '',
    answerMode: row.answer_mode,
    sourceMessageId: row.source_message_id,
    sourceConversationId: row.source_conversation_id,
    sourceKnowledgeBaseIds: row.source_knowledge_base_ids || [],
    citationSnapshot: citations,
    citation,
    sourceLabel: citation?.label || (row.answer_mode === 'rag' ? '知识库回答' : '通用回答'),
    selectionStart: row.selection_start,
    selectionEnd: row.selection_end,
    createdAt: row.created_at,
    savedAt: formatCardTime(row.created_at),
  };
}

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('请先登录');
  return user.id;
}

export async function listNotes({ notebookId, query } = {}) {
  let request = supabase
    .from('notes')
    .select('*, note_inspiration_cards(inspiration_card_id, sort_order, user_thought)')
    .order('updated_at', { ascending: false });

  if (notebookId) request = request.eq('notebook_id', notebookId);
  if (query?.trim()) request = request.ilike('title', `%${query.trim()}%`);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map(mapNote);
}

export async function createNote({ title, notebookId } = {}) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      title: title?.trim() || null,
      notebook_id: notebookId || null,
      content: emptyContent,
    })
    .select('*, note_inspiration_cards(inspiration_card_id, sort_order, user_thought)')
    .single();
  if (error) throw error;
  return mapNote(data);
}

export async function updateNote(id, patch = {}) {
  const updates = {};
  if (patch.title !== undefined) updates.title = patch.title?.trim() || null;
  if (patch.notebookId !== undefined) updates.notebook_id = patch.notebookId || null;
  if (patch.content !== undefined) updates.content = normalizeNoteContent(patch.content);

  const { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', id)
    .select('*, note_inspiration_cards(inspiration_card_id, sort_order, user_thought)')
    .single();
  if (error) throw error;
  return mapNote(data);
}

export async function deleteNote(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

export async function listNotebooks() {
  const { data, error } = await supabase
    .from('notebooks')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapNotebook);
}

export async function createNotebook({ name } = {}) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('notebooks')
    .insert({ user_id: userId, name: name?.trim() })
    .select()
    .single();
  if (error) throw error;
  return mapNotebook(data);
}

export async function renameNotebook(id, name) {
  const { data, error } = await supabase
    .from('notebooks')
    .update({ name: name?.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapNotebook(data);
}

export async function deleteNotebook(id, { strategy } = {}) {
  if (!['unfile', 'delete_notes'].includes(strategy)) {
    throw new Error('删除笔记本时必须指定 unfile 或 delete_notes 策略');
  }

  if (strategy === 'delete_notes') {
    const { error: notesError } = await supabase
      .from('notes')
      .delete()
      .eq('notebook_id', id);
    if (notesError) throw notesError;
  }

  const { error } = await supabase.from('notebooks').delete().eq('id', id);
  if (error) throw error;
}

export async function listInspirationCards({ query } = {}) {
  let request = supabase
    .from('inspiration_cards')
    .select('*')
    .order('created_at', { ascending: false });

  if (query?.trim()) request = request.ilike('content_snapshot', `%${query.trim()}%`);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map(mapInspirationCard);
}

export async function createInspirationCard(payload = {}) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('inspiration_cards')
    .insert({
      user_id: userId,
      content_snapshot: payload.contentSnapshot,
      source_question_snapshot: payload.questionSnapshot || null,
      answer_mode: payload.answerMode || 'general',
      source_message_id: payload.sourceMessageId || null,
      source_conversation_id: payload.sourceConversationId || null,
      source_knowledge_base_ids: payload.sourceKnowledgeBaseIds || null,
      citation_snapshot: payload.citationSnapshot || (payload.citation ? [payload.citation] : null),
      selection_start: payload.selectionStart ?? null,
      selection_end: payload.selectionEnd ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapInspirationCard(data);
}

export async function deleteInspirationCard(id) {
  const { error } = await supabase.from('inspiration_cards').delete().eq('id', id);
  if (error) throw error;
}

export function buildNoteMaterialRows(cardIdsOrdered = [], thoughtsByCardId = {}) {
  return [...new Set(cardIdsOrdered)].map((inspirationCardId, sortOrder) => ({
    inspiration_card_id: inspirationCardId,
    sort_order: sortOrder,
    user_thought: thoughtsByCardId[inspirationCardId] || null,
  }));
}

export async function setNoteMaterials(noteId, { cardIdsOrdered = [], thoughtsByCardId = {} } = {}) {
  await getCurrentUserId();
  const { data, error } = await supabase.rpc('replace_note_inspiration_cards', {
    p_note_id: noteId,
    p_rows: buildNoteMaterialRows(cardIdsOrdered, thoughtsByCardId),
  });
  if (error) throw error;
  return data || [];
}
