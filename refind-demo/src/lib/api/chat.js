import { supabase } from '../supabaseClient.js';

export function mapChatResponseToMessage({
  question,
  selectedBases = [],
  selectedTags = [],
  online = false,
  response,
}) {
  if (!response || typeof response !== 'object') {
    throw new Error('AI 服务返回为空');
  }
  if (response.error) {
    throw new Error(String(response.error));
  }
  if (typeof response.content !== 'string' || !response.content.trim()) {
    throw new Error('AI 未返回有效回答');
  }
  return {
    id: response.assistantMessageId,
    userMessageId: response.userMessageId,
    conversationId: response.conversationId,
    question,
    answer: response.content,
    mode: response.answerMode,
    online,
    selectedBases: [...selectedBases],
    selectedTags: [...selectedTags],
    insufficient: response.insufficient === true,
    citations: (response.citations || []).map((citation) => ({
      order: citation.order,
      label: citation.title,
      materialId: citation.materialId,
      excerpt: citation.excerpt,
    })),
    webSources: (response.webSources || [])
      .filter((s) => s?.url)
      .map((s, i) => ({
        order: Number(s.order) || i + 1,
        title: String(s.title || s.url),
        url: String(s.url),
      })),
  };
}

async function readFunctionError(error, data) {
  if (data?.error) return String(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
    if (body?.message) return String(body.message);
  } catch {
    // ignore parse failures
  }
  return error?.message || 'AI 回答生成失败，请稍后重试。';
}

export async function sendChatMessage({
  content,
  thinkingMode = 'fast',
  onlineEnabled = false,
  modelId,
  knowledgeBaseIds = [],
  tagFilters = [],
  surface,
  conversationId,
  selectedBases = [],
  selectedTags = [],
}) {
  const body = {
    content,
    thinkingMode,
    onlineEnabled,
    knowledgeBaseIds,
    tagFilters,
    surface,
  };
  if (conversationId) body.conversationId = conversationId;
  if (modelId) body.modelId = modelId;

  const { data, error } = await supabase.functions.invoke('chat-message', {
    body,
  });
  if (error) throw new Error(await readFunctionError(error, data));

  return mapChatResponseToMessage({
    question: content,
    selectedBases,
    selectedTags,
    online: onlineEnabled,
    response: data,
  });
}
