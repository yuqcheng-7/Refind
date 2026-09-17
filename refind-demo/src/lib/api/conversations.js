import { supabase } from '../supabaseClient.js';

/** Home / knowledge chat history is only listed within this window. */
export const CONVERSATION_HISTORY_RETENTION_DAYS = 90;

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function conversationHistoryCutoffIso(
  now = new Date(),
  days = CONVERSATION_HISTORY_RETENTION_DAYS,
) {
  const cutoff = startOfLocalDay(now);
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(days) || CONVERSATION_HISTORY_RETENTION_DAYS));
  return cutoff.toISOString();
}

export function isWithinConversationHistoryRetention(
  value,
  now = new Date(),
  days = CONVERSATION_HISTORY_RETENTION_DAYS,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= new Date(conversationHistoryCutoffIso(now, days)).getTime();
}

/** @returns {{ label: string, sortKey: number }} */
export function conversationDayMeta(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { label: '未知日期', sortKey: 0 };
  }
  const today = startOfLocalDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = startOfLocalDay(date);
  if (day.getTime() === today.getTime()) {
    return { label: '今天', sortKey: Number.MAX_SAFE_INTEGER };
  }
  if (day.getTime() === yesterday.getTime()) {
    return { label: '昨天', sortKey: Number.MAX_SAFE_INTEGER - 1 };
  }
  return {
    label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    sortKey: day.getTime(),
  };
}

export function groupLabelForDate(value, now = new Date()) {
  return conversationDayMeta(value, now).label;
}

export function groupConversationsByDay(conversations = [], now = new Date()) {
  const buckets = new Map();
  for (const item of conversations) {
    if (!isWithinConversationHistoryRetention(item.updatedAt, now)) continue;
    const { label, sortKey } = conversationDayMeta(item.updatedAt, now);
    if (!buckets.has(label)) buckets.set(label, { label, sortKey, items: [] });
    buckets.get(label).items.push(item);
  }
  return [...buckets.values()]
    .sort((a, b) => b.sortKey - a.sortKey)
    .map(({ label, items }) => ({ label, items }));
}

export function extractHashTagNamesFromText(prompt = '') {
  const text = String(prompt || '');
  const found = [];
  const seen = new Set();
  const pattern = /#([^\s#]+)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = String(match[1] || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

export function pairChatTurns(messages = [], citationsByMessageId = {}) {
  const turns = [];
  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index];
    if (userMessage.role !== 'user') continue;
    const assistantMessage = messages[index + 1]?.role === 'assistant'
      ? messages[index + 1]
      : null;
    const citations = assistantMessage
      ? (citationsByMessageId[assistantMessage.id] || [])
      : [];
    const selectedTags = extractHashTagNamesFromText(userMessage.content);
    turns.push({
      id: assistantMessage?.id || userMessage.id,
      userMessageId: userMessage.id,
      question: userMessage.content,
      answer: assistantMessage?.content || '',
      mode: assistantMessage?.answer_mode || userMessage.answer_mode,
      insufficient: assistantMessage?.is_insufficient === true,
      selectedBases: [],
      selectedTags,
      citations: citations.map((citation) => ({
        order: citation.citation_order,
        label: citation.material_title_snapshot,
        materialId: citation.material_id,
        excerpt: citation.excerpt,
      })),
      webSources: Array.isArray(assistantMessage?.web_sources)
        ? assistantMessage.web_sources
        : [],
    });
  }
  return turns;
}

function mapConversationRow(row) {
  return {
    id: row.id,
    title: row.title || '未命名会话',
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export const NEW_CONVERSATION_TITLE = '新会话';

export function isPlaceholderTitle(title) {
  const value = String(title || '').trim();
  return !value || value === NEW_CONVERSATION_TITLE || value === '未命名会话';
}

export async function createConversation({ surface = 'home', knowledgeBaseId, title } = {}) {
  if (surface !== 'home' && surface !== 'knowledge') {
    throw new Error('surface must be home or knowledge');
  }
  if (surface === 'knowledge' && !knowledgeBaseId) {
    throw new Error('knowledgeBaseId is required');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('请先登录');

  const insertRow = {
    user_id: user.id,
    title: String(title || NEW_CONVERSATION_TITLE).trim() || NEW_CONVERSATION_TITLE,
    surface,
  };
  if (surface === 'knowledge') {
    insertRow.knowledge_base_id = knowledgeBaseId;
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert(insertRow)
    .select('id, title, updated_at, created_at')
    .single();
  if (error) throw error;
  return mapConversationRow(data);
}

export async function listConversations({ surface = 'home', knowledgeBaseId } = {}) {
  let query = supabase
    .from('chat_conversations')
    .select('id, title, updated_at, created_at')
    .eq('surface', surface)
    .gte('updated_at', conversationHistoryCutoffIso())
    .order('updated_at', { ascending: false })
    .limit(200);

  if (surface === 'knowledge') {
    if (!knowledgeBaseId) return [];
    query = query.eq('knowledge_base_id', knowledgeBaseId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || [])
    .map(mapConversationRow)
    .filter((item) => isWithinConversationHistoryRetention(item.updatedAt));
}

export async function loadConversationTurns(conversationId) {
  if (!conversationId) return [];

  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('id, role, content, answer_mode, is_insufficient, created_at, web_sources')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (messagesError) throw messagesError;
  if (!messages?.length) return [];

  const assistantIds = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.id);
  if (!assistantIds.length) {
    return pairChatTurns(messages, {});
  }

  const { data: citations, error: citationsError } = await supabase
    .from('message_citations')
    .select('message_id, material_id, material_title_snapshot, excerpt, citation_order')
    .in('message_id', assistantIds)
    .order('citation_order', { ascending: true });
  if (citationsError) throw citationsError;

  const citationsByMessageId = {};
  for (const citation of citations || []) {
    if (!citationsByMessageId[citation.message_id]) {
      citationsByMessageId[citation.message_id] = [];
    }
    citationsByMessageId[citation.message_id].push(citation);
  }

  return pairChatTurns(messages, citationsByMessageId);
}

export async function renameConversation(conversationId, title) {
  const nextTitle = String(title || '').trim();
  if (!conversationId) throw new Error('conversationId is required');
  if (!nextTitle) throw new Error('title is required');

  const { data, error } = await supabase
    .from('chat_conversations')
    .update({ title: nextTitle.slice(0, 80) })
    .eq('id', conversationId)
    .select('id, title, updated_at, created_at')
    .single();
  if (error) throw error;
  return mapConversationRow(data);
}

export async function deleteConversation(conversationId) {
  if (!conversationId) throw new Error('conversationId is required');
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId);
  if (error) throw error;
}

export async function truncateConversationFromTurn(conversationId, turnId) {
  if (!conversationId || !turnId) return;

  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('id, role, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (messagesError) throw messagesError;
  if (!messages?.length) return;

  let startIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].id !== turnId) continue;
    startIndex = messages[index].role === 'assistant'
      && index > 0
      && messages[index - 1].role === 'user'
      ? index - 1
      : index;
    break;
  }
  if (startIndex < 0) return;

  const ids = messages.slice(startIndex).map((message) => message.id);
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .in('id', ids);
  if (error) throw error;
}

export async function deleteChatMessages(messageIds = []) {
  const ids = [...new Set((messageIds || []).filter(Boolean))];
  if (!ids.length) return;
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .in('id', ids);
  if (error) throw error;
}
