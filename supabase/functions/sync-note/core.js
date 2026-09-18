/**
 * Pure helpers for sync-note Edge Function.
 * Keep Deno-free so node:test can exercise mapping / delete rules.
 */

export function normalizeRequestBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request body must be an object');
  }
  const noteId = typeof value.noteId === 'string' ? value.noteId.trim() : '';
  if (!noteId) throw new Error('noteId is required');

  const rawIds = Array.isArray(value.knowledgeBaseIds) ? value.knowledgeBaseIds : null;
  if (!rawIds) throw new Error('knowledgeBaseIds is required');

  const seen = new Set();
  const knowledgeBaseIds = [];
  for (const item of rawIds) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    knowledgeBaseIds.push(id);
  }
  if (!knowledgeBaseIds.length) throw new Error('knowledgeBaseIds is required');

  return { noteId, knowledgeBaseIds };
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function noteBodyText(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content) ? content : {};
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  if (text) return text;

  if (Array.isArray(value.sections) && value.sections.length) {
    const fromSections = value.sections
      .map((section) => {
        if (typeof section?.text === 'string' && section.text.trim()) return section.text.trim();
        if ((section?.type === 'bullet_list' || section?.type === 'ordered_list') && Array.isArray(section.items)) {
          return section.items
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
            .map((item) => `• ${item}`)
            .join('\n');
        }
        if (section?.type === 'heading' && typeof section?.text === 'string') return section.text.trim();
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (fromSections) return fromSections;
  }

  if (typeof value.html === 'string' && value.html.trim()) {
    return stripHtml(value.html);
  }

  return '';
}

export function buildSyncedMaterialInsert({ userId, knowledgeBaseId, note } = {}) {
  const title = (typeof note?.title === 'string' && note.title.trim()) || '未命名笔记';
  const contentText = noteBodyText(note?.content);
  const excerpt = contentText.slice(0, 240);
  return {
    user_id: userId,
    knowledge_base_id: knowledgeBaseId,
    input_type: 'note',
    platform_code: 'note',
    origin_type: 'note',
    origin_note_id: note.id,
    title,
    content_text: contentText,
    content_excerpt: excerpt || title,
    summary: excerpt || '由笔记同步',
    status: 'ready',
    is_new: true,
  };
}

export function buildFanOutMaterialPatch({ title, content } = {}) {
  const nextTitle = (typeof title === 'string' && title.trim()) || '未命名笔记';
  const contentText = noteBodyText(content);
  return {
    title: nextTitle,
    content_text: contentText,
    content_excerpt: (contentText || nextTitle).slice(0, 240),
    summary: (contentText || nextTitle).slice(0, 240) || '由笔记同步',
  };
}

export function deleteSyncPolicy() {
  return {
    onNoteDelete: 'delete_synced_materials',
    onMaterialDelete: 'unlink_only',
    onKnowledgeBaseDelete: 'unlink_only',
  };
}

export function shouldFanInFromMaterial(material) {
  return material?.origin_type === 'note' && Boolean(material?.origin_note_id);
}

export function summarizeSyncOutcomes(outcomes = []) {
  const synced = [];
  const failed = [];
  for (const row of outcomes) {
    if (row?.ok) {
      synced.push({
        knowledgeBaseId: row.knowledgeBaseId,
        materialId: row.materialId,
      });
    } else {
      failed.push({
        knowledgeBaseId: row.knowledgeBaseId,
        error: row?.error || 'sync failed',
      });
    }
  }
  return { synced, failed };
}
