import { supabase } from '../supabaseClient.js';
import { formatRelativeDateTime } from '../formatTime.js';
import { stripMarkdownForReading } from '../../features/chat/formatAnswerText.js';
import { generateNoteDocument } from '../../features/notes/noteState.js';
import { normalizeOutline } from '../../features/notes/materialOutline.js';
import { parseCitationMarkers } from './ragMode.js';

const emptyContent = { text: '', blocks: [], sections: [] };

const noteSelect = '*, note_inspiration_cards(inspiration_card_id, sort_order, user_thought), note_knowledge_base_materials(knowledge_base_id, material_id)';

async function readFunctionError(error, data, fallback = '请求失败，请稍后重试。') {
  if (data?.error) return String(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch {
    // ignore parse failures
  }
  return error?.message || fallback;
}

/** Plain body text used when pushing a note into synced materials. */
export function noteContentToMaterialText(content) {
  const value = normalizeNoteContent(content);
  if (value.text?.trim()) return value.text.trim();
  if (value.sections?.length) {
    const fromSections = value.sections
      .map((section) => (typeof section?.text === 'string' ? section.text.trim() : ''))
      .filter(Boolean)
      .join('\n\n');
    if (fromSections) return fromSections;
  }
  return '';
}

function buildFanOutMaterialPatch({ title, content } = {}) {
  const nextTitle = (typeof title === 'string' && title.trim()) || '未命名笔记';
  const contentText = noteContentToMaterialText(content);
  return {
    title: nextTitle,
    content_text: contentText,
    content_excerpt: (contentText || nextTitle).slice(0, 240),
    summary: (contentText || nextTitle).slice(0, 240) || '由笔记同步',
  };
}

export function normalizeNoteContent(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content)
    ? content
    : {};
  const outline = normalizeOutline(value.outline);
  const next = {
    ...value,
    text: typeof value.text === 'string' ? value.text : '',
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    sections: Array.isArray(value.sections) ? value.sections : [],
  };
  if (outline) next.outline = outline;
  else delete next.outline;
  return next;
}

function formatCardTime(value) {
  return formatRelativeDateTime(value);
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
  const syncLinks = Array.isArray(row.note_knowledge_base_materials)
    ? row.note_knowledge_base_materials
    : [];

  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title || '未命名笔记',
    content: normalizeNoteContent(row.content || emptyContent),
    inspirationCardIds: relations.map((relation) => relation.inspiration_card_id),
    materialThoughts: Object.fromEntries(relations
      .filter((relation) => relation.user_thought != null)
      .map((relation) => [relation.inspiration_card_id, relation.user_thought])),
    syncedBaseIds: [...new Set(
      syncLinks
        .map((link) => link.knowledge_base_id)
        .filter(Boolean),
    )],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedLabel: formatCardTime(row.updated_at),
  };
}

export function mapInspirationCard(row) {
  const citations = Array.isArray(row.citation_snapshot) ? row.citation_snapshot : [];
  const citation = citations[0] || null;
  const answerMode = row.answer_mode || 'general';

  return {
    id: row.id,
    contentSnapshot: row.content_snapshot,
    questionSnapshot: row.source_question_snapshot || '',
    answerMode,
    sourceMessageId: row.source_message_id,
    sourceConversationId: row.source_conversation_id,
    sourceKnowledgeBaseIds: row.source_knowledge_base_ids || [],
    sourceKnowledgeBaseNames: [],
    citationSnapshot: citations,
    citation,
    // Header/list label is the knowledge origin — never the material title.
    sourceLabel: answerMode === 'rag' ? '知识库回答' : '通用回答',
    selectionStart: row.selection_start,
    selectionEnd: row.selection_end,
    createdAt: row.created_at,
    savedAt: formatCardTime(row.created_at),
  };
}

/** Plain preview text for card covers (no markdown ornaments). */
export function formatCardPreviewText(text = '') {
  return stripMarkdownForReading(text)
    .replace(/\s*\[\d+\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Top-of-card label: knowledge base name(s), or 通用回答. */
export function resolveCardOriginLabel(card, knowledgeBases = []) {
  if (!card) return '';
  if (card.answerMode !== 'rag') return '通用回答';
  const ids = card.sourceKnowledgeBaseIds || [];
  const namesFromIds = ids
    .map((id) => knowledgeBases.find((base) => base.id === id)?.name)
    .filter(Boolean);
  if (namesFromIds.length) return [...new Set(namesFromIds)].join('、');
  const names = (card.sourceKnowledgeBaseNames || []).filter(Boolean);
  if (names.length) return [...new Set(names)].join('、');
  if (card.sourceLabel && card.sourceLabel !== '知识库回答' && card.sourceLabel !== card.citation?.label) {
    return card.sourceLabel;
  }
  return '知识库回答';
}

/** Bottom-of-card material titles (one or many). */
export function resolveCardMaterialLabels(card) {
  return resolveCardCitedMaterials(card).map((item) => item.label).filter(Boolean);
}

export function citationsForCardDisplay(card) {
  const list = Array.isArray(card?.citationSnapshot) && card.citationSnapshot.length
    ? card.citationSnapshot
    : (card?.citation ? [card.citation] : []);
  return list.map((item, index) => ({
    order: item.order ?? index + 1,
    label: item.label,
    materialId: item.materialId || item.sourceId,
    excerpt: item.excerpt,
  }));
}

/**
 * Materials shown under a card: prefer those actually cited in the snapshot text.
 * Falls back to the full citation snapshot when the text has no [n] markers.
 */
export function resolveCardCitedMaterials(card) {
  const all = citationsForCardDisplay(card);
  const orders = parseCitationMarkers(card?.contentSnapshot || '');
  if (!orders.length) return all;
  const byOrder = new Map(all.map((item) => [Number(item.order), item]));
  const listed = [];
  const seen = new Set();
  for (const order of orders) {
    const found = byOrder.get(order);
    if (!found || seen.has(order)) continue;
    seen.add(order);
    listed.push(found);
  }
  // If markers exist but snapshot is incomplete, still surface whatever we know.
  return listed.length ? listed : all;
}

/** Keep only citations referenced by the saved fragment (or all when unmarked). */
export function citationsReferencedByText(contentSnapshot, citations = []) {
  const list = (citations || []).map((item, index) => ({
    order: item.order ?? index + 1,
    label: item.label,
    sourceId: item.materialId || item.sourceId,
    materialId: item.materialId || item.sourceId,
    excerpt: item.excerpt,
  }));
  const orders = parseCitationMarkers(contentSnapshot || '');
  if (!orders.length) return list;
  const byOrder = new Map(list.map((item) => [Number(item.order), item]));
  return orders.map((order) => byOrder.get(order)).filter(Boolean);
}

function startOfLocalDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** timeFilter: 'all' | 'today' | '7d' | '30d' */
export function cardMatchesTimeFilter(card, timeFilter = 'all', now = new Date()) {
  if (!timeFilter || timeFilter === 'all') return true;
  const created = new Date(card?.createdAt);
  if (Number.isNaN(created.getTime())) return true;
  const today = startOfLocalDay(now);
  if (timeFilter === 'today') return created.getTime() >= today.getTime();
  if (timeFilter === '7d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    return created.getTime() >= from.getTime();
  }
  if (timeFilter === '30d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 29);
    return created.getTime() >= from.getTime();
  }
  return true;
}

/** originFilter: 'all' | 'general' | knowledgeBaseId */
export function cardMatchesOriginFilter(card, originFilter = 'all') {
  if (!originFilter || originFilter === 'all') return true;
  if (originFilter === 'general') return card?.answerMode !== 'rag';
  return (card?.sourceKnowledgeBaseIds || []).includes(originFilter);
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
    .select(noteSelect)
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
    .select(noteSelect)
    .single();
  if (error) throw error;
  return mapNote(data);
}

/**
 * Best-effort fan-out: push note title/body to linked origin_type=note materials and re-embed.
 * Failures are swallowed by the caller (void) so note save stays non-blocking.
 */
export async function pushNoteToSyncedMaterials(noteId, { title, content } = {}) {
  const id = typeof noteId === 'string' ? noteId.trim() : '';
  if (!id) return { updated: [], failed: [] };

  const { data: links, error: linkError } = await supabase
    .from('note_knowledge_base_materials')
    .select('material_id')
    .eq('note_id', id);
  if (linkError) throw linkError;

  const materialIds = [...new Set((links || []).map((row) => row.material_id).filter(Boolean))];
  if (!materialIds.length) return { updated: [], failed: [] };

  const patch = buildFanOutMaterialPatch({ title, content });
  const updated = [];
  const failed = [];

  for (const materialId of materialIds) {
    try {
      const { error: updateError } = await supabase
        .from('materials')
        .update(patch)
        .eq('id', materialId)
        .eq('origin_type', 'note');
      if (updateError) throw updateError;
      updated.push(materialId);
      void supabase.functions.invoke('embed-material', {
        body: { materialId, rebuildChunks: true },
      });
    } catch (error) {
      failed.push({
        materialId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { updated, failed };
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
    .select(noteSelect)
    .single();
  if (error) throw error;
  const mapped = mapNote(data);

  // Fan-out title/body to synced materials (async OK). Notebook-only moves skip this.
  if (patch.title !== undefined || patch.content !== undefined) {
    void pushNoteToSyncedMaterials(id, {
      title: mapped.title,
      content: mapped.content,
    });
  }

  return mapped;
}

/**
 * Delete note and permanently remove synced materials (Spec §5.7).
 * Inspiration cards are preserved (no FK cascade to them).
 */
export async function deleteNote(id) {
  const materialIds = new Set();

  const { data: links, error: linkError } = await supabase
    .from('note_knowledge_base_materials')
    .select('material_id')
    .eq('note_id', id);
  if (linkError) throw linkError;
  for (const row of links || []) {
    if (row.material_id) materialIds.add(row.material_id);
  }

  const { data: originRows, error: originError } = await supabase
    .from('materials')
    .select('id')
    .eq('origin_note_id', id)
    .eq('origin_type', 'note');
  if (originError) throw originError;
  for (const row of originRows || []) {
    if (row.id) materialIds.add(row.id);
  }

  if (materialIds.size) {
    const { error: materialsError } = await supabase
      .from('materials')
      .delete()
      .in('id', [...materialIds]);
    if (materialsError) throw materialsError;
  }

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
  const rows = data || [];
  const conversationIds = [...new Set(
    rows
      .filter((row) => {
        const ids = row.source_knowledge_base_ids;
        const empty = !ids || (Array.isArray(ids) && ids.length === 0);
        return empty && row.source_conversation_id;
      })
      .map((row) => row.source_conversation_id),
  )];

  let kbIdByConversation = {};
  if (conversationIds.length) {
    const { data: conversations } = await supabase
      .from('chat_conversations')
      .select('id, knowledge_base_id')
      .in('id', conversationIds);
    kbIdByConversation = Object.fromEntries(
      (conversations || [])
        .filter((item) => item.knowledge_base_id)
        .map((item) => [item.id, item.knowledge_base_id]),
    );
  }

  return rows.map((row) => {
    const mapped = mapInspirationCard(row);
    if (
      !mapped.sourceKnowledgeBaseIds.length
      && row.source_conversation_id
      && kbIdByConversation[row.source_conversation_id]
    ) {
      mapped.sourceKnowledgeBaseIds = [kbIdByConversation[row.source_conversation_id]];
    }
    return mapped;
  });
}

/** Prefer an explicit citationSnapshot (including empty/null) over a leftover citation. */
export function resolveCitationSnapshotForInsert(payload = {}) {
  if (payload.answerMode === 'general') return null;
  if (Array.isArray(payload.citationSnapshot)) {
    return payload.citationSnapshot.length ? payload.citationSnapshot : null;
  }
  if (payload.citationSnapshot === null) return null;
  if (payload.citation) return [payload.citation];
  return null;
}

/** Prepend a newly saved card so the inspiration list updates immediately. */
export function prependInspirationCard(cards = [], card) {
  if (!card) return [...cards];
  const rest = card.id ? cards.filter((item) => item.id !== card.id) : cards;
  return [card, ...rest];
}

export async function createInspirationCard(payload = {}) {
  const userId = await getCurrentUserId();
  const knowledgeBaseIds = payload.sourceKnowledgeBaseIds?.length
    ? payload.sourceKnowledgeBaseIds
    : null;
  const { data, error } = await supabase
    .from('inspiration_cards')
    .insert({
      user_id: userId,
      content_snapshot: payload.contentSnapshot,
      source_question_snapshot: payload.questionSnapshot || null,
      answer_mode: payload.answerMode || 'general',
      source_message_id: payload.sourceMessageId || null,
      source_conversation_id: payload.sourceConversationId || null,
      source_knowledge_base_ids: knowledgeBaseIds,
      citation_snapshot: resolveCitationSnapshotForInsert(payload),
      selection_start: payload.selectionStart ?? null,
      selection_end: payload.selectionEnd ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const mapped = mapInspirationCard(data);
  if (!mapped.sourceKnowledgeBaseIds.length && payload.sourceKnowledgeBaseNames?.length) {
    mapped.sourceKnowledgeBaseNames = [...payload.sourceKnowledgeBaseNames];
  }
  if (
    Array.isArray(payload.citationSnapshot)
    && payload.citationSnapshot.length
    && !mapped.citationSnapshot.length
  ) {
    mapped.citationSnapshot = payload.citationSnapshot;
    mapped.citation = payload.citationSnapshot[0] || mapped.citation;
  }
  return mapped;
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

/**
 * Call Edge `generate-note`. Demo local fallback only when VITE_ALLOW_DEMO_GENERATE=true.
 * @param {string} noteId
 * @param {{ note?: object, cards?: object[] }} [opts] used only for demo fallback
 */
export async function generateNote(noteId, opts = {}) {
  const id = typeof noteId === 'string' ? noteId.trim() : '';
  if (!id) throw new Error('noteId is required');

  if (import.meta.env.VITE_ALLOW_DEMO_GENERATE === 'true' && opts.note && Array.isArray(opts.cards)) {
    const content = generateNoteDocument(opts.note, opts.cards);
    return {
      ...opts.note,
      id,
      content: normalizeNoteContent(content),
      updatedLabel: '刚刚生成',
    };
  }

  const { data, error } = await supabase.functions.invoke('generate-note', {
    body: { noteId: id },
  });
  if (error) throw new Error(await readFunctionError(error, data, '笔记生成失败，请稍后重试。'));
  if (data?.error) throw new Error(String(data.error));
  if (!data || typeof data !== 'object') throw new Error('笔记生成返回为空');
  return mapNote(data);
}

export async function outlineNoteMaterials(noteId) {
  const id = typeof noteId === 'string' ? noteId.trim() : '';
  if (!id) throw new Error('noteId is required');

  const { data, error } = await supabase.functions.invoke('outline-note-materials', {
    body: { noteId: id },
  });
  if (error) throw new Error(await readFunctionError(error, data, '成章失败，请稍后重试。'));
  if (data?.error) throw new Error(String(data.error));
  if (!data || typeof data !== 'object') throw new Error('成章返回为空');
  return mapNote(data);
}

/**
 * Sync a note into one or more knowledge bases via Edge `sync-note`.
 * Creates/updates `origin_type=note` materials + `note_knowledge_base_materials` links.
 *
 * @param {{ noteId: string, knowledgeBaseIds: string[] }} args
 * @returns {Promise<{ noteId: string, synced: object[], failed: object[], knowledgeBaseIds: string[] }>}
 *
 * GAP — material-edit fan-in: there is no material body-edit API/UI hook yet.
 * When one is added, if `origin_type=note`, update the note then call
 * `pushNoteToSyncedMaterials` (or re-invoke sync-note) for other links.
 * Pure rule: see `shouldFanInFromMaterial` in supabase/functions/sync-note/core.js.
 */
export async function syncNote({ noteId, knowledgeBaseIds } = {}) {
  const id = typeof noteId === 'string' ? noteId.trim() : '';
  if (!id) throw new Error('noteId is required');

  const ids = [...new Set(
    (Array.isArray(knowledgeBaseIds) ? knowledgeBaseIds : [])
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean),
  )];
  if (!ids.length) throw new Error('knowledgeBaseIds is required');

  const { data, error } = await supabase.functions.invoke('sync-note', {
    body: { noteId: id, knowledgeBaseIds: ids },
  });
  if (error) throw new Error(await readFunctionError(error, data, '同步失败，请稍后重试。'));
  if (data?.error) throw new Error(String(data.error));

  return {
    noteId: data?.noteId || id,
    synced: Array.isArray(data?.synced) ? data.synced : [],
    failed: Array.isArray(data?.failed) ? data.failed : [],
    knowledgeBaseIds: Array.isArray(data?.knowledgeBaseIds)
      ? data.knowledgeBaseIds
      : (Array.isArray(data?.synced) ? data.synced.map((row) => row.knowledgeBaseId).filter(Boolean) : []),
  };
}
