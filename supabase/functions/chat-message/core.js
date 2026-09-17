import { focusExcerpt } from '../_shared/chunkText.js';
import { RAG_INSUFFICIENT_CONTENT } from '../_shared/ragRetrieve.js';
import {
  repairAnswerStructure,
  sanitizeRagAnswer,
} from '../_shared/answerFormat.js';

export const SOFT_SIMILARITY_FLOOR = 0.2;
export { RAG_INSUFFICIENT_CONTENT };
export {
  repairAnswerStructure,
  sanitizeRagAnswer,
  sanitizeInlineMarkdown,
  normalizeCitationPlacement,
} from '../_shared/answerFormat.js';


function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))];
}

function resolveModelId(value) {
  const raw = String(value.modelId || '').trim();
  if (raw === 'qwen' || raw === 'ds-fast' || raw === 'ds-deep') return raw;
  if (value.thinkingMode === 'deep') return 'ds-deep';
  if (value.thinkingMode === 'qwen') return 'qwen';
  return 'ds-fast';
}

export function normalizeRequestBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('request body must be an object');
  }

  const content = typeof value.content === 'string' ? value.content.trim() : '';
  if (!content) throw new Error('content is required');
  if (value.surface !== 'home' && value.surface !== 'knowledge') {
    throw new Error('surface must be home or knowledge');
  }

  const knowledgeBaseIds = uniqueStrings(value.knowledgeBaseIds);
  if (value.surface === 'knowledge' && knowledgeBaseIds.length === 0) {
    throw new Error('knowledge surface requires at least one knowledgeBaseId');
  }

  const modelId = resolveModelId(value);
  const retrievalContent = typeof value.retrievalContent === 'string'
    ? value.retrievalContent.trim()
    : '';
  const body = {
    content,
    // Ask text used for embedding / rewrite; falls back to visible content.
    retrievalContent: retrievalContent || content,
    modelId,
    thinkingMode: modelId === 'ds-deep' ? 'deep' : 'fast',
    onlineEnabled: value.onlineEnabled === true,
    knowledgeBaseIds,
    tagFilters: uniqueStrings(value.tagFilters),
    surface: value.surface,
  };
  const conversationId = typeof value.conversationId === 'string'
    ? value.conversationId.trim()
    : '';
  return conversationId ? { conversationId, ...body } : body;
}

/** Keep home and knowledge histories isolated when continuing a thread. */
export function shouldReuseConversation(conversation, request) {
  if (!conversation || !request) return false;
  if (conversation.surface !== request.surface) return false;
  if (request.surface === 'knowledge') {
    const requestKbId = request.knowledgeBaseIds?.[0];
    if (conversation.knowledge_base_id && requestKbId
      && conversation.knowledge_base_id !== requestKbId) {
      return false;
    }
  }
  return true;
}

export function isPlaceholderTitle(title) {
  const value = String(title || '').trim();
  return !value || value === '新会话' || value === '未命名会话';
}

/** Empty drafts may move between home/knowledge before the first message. */
export function canRebindEmptyConversation(conversation, request, messageCount = 0) {
  if (!conversation || !request) return false;
  if (Number(messageCount) > 0) return false;
  if (request.surface === 'knowledge' && !(request.knowledgeBaseIds?.length > 0)) return false;
  return true;
}

export function buildConversationRebindPatch(conversation, request) {
  if (!canRebindEmptyConversation(conversation, request, 0)) return null;
  const patch = {
    surface: request.surface,
    knowledge_base_id: request.surface === 'knowledge'
      ? request.knowledgeBaseIds[0]
      : null,
  };
  if (isPlaceholderTitle(conversation.title) && request.content) {
    patch.title = String(request.content).slice(0, 60);
  }
  return patch;
}

export function selectUsableChunks(rows, floor = SOFT_SIMILARITY_FLOOR) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => Number(row?.similarity) >= floor);
}

export function sanitizeAnswerCitations(answer, maxOrder) {
  const seen = new Set();
  const orders = [];
  const limit = Number.isInteger(maxOrder) && maxOrder > 0 ? maxOrder : 0;
  const content = answer.replace(/\[(\d+)\]/g, (marker, value) => {
    const order = Number(value);
    if (!Number.isInteger(order) || order < 1 || order > limit) return '';
    if (!seen.has(order)) {
      seen.add(order);
      orders.push(order);
    }
    return marker;
  });
  return { content, orders };
}

export function resolveRagAnswerOutcome({ answer, chunks }) {
  const list = Array.isArray(chunks) ? chunks : [];
  // Global sanitize: structure + safe short bold only; never leave raw * / **.
  const text = sanitizeRagAnswer(String(answer || '').trim());
  if (list.length === 0) {
    return {
      content: RAG_INSUFFICIENT_CONTENT,
      isInsufficient: true,
      orders: [],
      reason: '无参考片段',
    };
  }
  if (!text || text === RAG_INSUFFICIENT_CONTENT || text.includes('暂无相关资料')) {
    return {
      content: RAG_INSUFFICIENT_CONTENT,
      isInsufficient: true,
      orders: [],
      reason: '没有检测到有效[n]引用',
    };
  }
  const sanitized = sanitizeAnswerCitations(text, list.length);
  if (sanitized.orders.length === 0) {
    return {
      content: RAG_INSUFFICIENT_CONTENT,
      isInsufficient: true,
      orders: [],
      reason: '没有检测到有效[n]引用',
    };
  }
  return {
    content: sanitized.content,
    isInsufficient: false,
    orders: sanitized.orders,
    reason: 'ok',
  };
}

export function buildCitationRows(messageId, orders, chunks, answer = '') {
  const seen = new Set();
  const rows = [];
  for (const order of orders) {
    if (!Number.isInteger(order) || order < 1 || order > chunks.length || seen.has(order)) continue;
    seen.add(order);
    const chunk = chunks[order - 1];
    rows.push({
      message_id: messageId,
      material_id: chunk.material_id,
      knowledge_base_name_snapshot: chunk.knowledge_base_name,
      material_title_snapshot: chunk.material_title,
      excerpt: focusExcerpt(chunk.content, { answer, order, max: 160 }),
      citation_order: order,
    });
  }
  return rows;
}

export function buildRetrievalSummary(chunks) {
  return {
    knowledgeBaseCount: new Set(chunks.map((chunk) => chunk.knowledge_base_id)).size,
    materialCount: new Set(chunks.map((chunk) => chunk.material_id)).size,
    chunkCount: chunks.length,
  };
}

/** General (no KB/tags) uses Qwen when online, or when the user picked QW offline. */
export function shouldUseQwenGeneralChat(body = {}) {
  return body.onlineEnabled === true || body.modelId === 'qwen';
}

export function buildGeneralChatSystemContent(onlineEnabled) {
  return `你是拾藏助手，像懂行的朋友用自然中文聊天。
要求：
- 直接把话说清楚，像人与人交流，不要用 Markdown（禁止 **加粗**、# 标题、\`代码\`、--- 分隔线等符号残留在正文里）。
- 大标题：只用「一、二、三、」（单独成行，约 12 字）。大标题下才能跟小分点；禁止小分点后再出现「一、二、三、」。
- 小分点：有序用「1. 2. 3. 4.」（必须递增）；无序用「· 」。禁止多个「1.」并列。
- 短标题：仅当需要先命名再展开时使用；2～12 字，写成 **短标题：** 后接正文（正文不加粗）。整句说明不要硬拆成短标题。
- 禁止「一、标题1.」或「……。二、」粘行；换段必须换行。
- 可以承接上文对话（包括用户刚在知识库模式问过的内容）做连续追问；不要伪造知识库引用或「根据资料」字样。
${onlineEnabled ? '- 已启用联网搜索；可依据检索结果回答。不要在正文里写 [n] 编号；来源会由界面单独展示。' : ''}`;
}

/** Remove leftover [n] markers from general/online answers (sources live in the footer). */
export function stripLeftoverCitationMarkers(text = '') {
  return String(text)
    .replace(/\[(\d+)\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function resolveGeneralWebSources(onlineEnabled, webSources) {
  if (onlineEnabled !== true || !Array.isArray(webSources)) return [];
  return webSources;
}

export function persistableWebSources(webSources) {
  return Array.isArray(webSources) && webSources.length ? webSources : null;
}

/** Strip markdown so general chat reads like plain conversation. */
export function stripMarkdownForReading(text = '') {
  let value = String(text || '').replace(/\r\n/g, '\n').replace(/\u2022/g, '·').replace(/\u00B7/g, '·').trim();
  if (!value) return '';
  value = value.replace(/^#{1,6}\s+/gm, '');
  value = value.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  value = value.replace(/\*\*([^*]+)\*\*/g, '$1');
  value = value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  value = value.replace(/__([^_]+)__/g, '$1');
  value = value.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
  value = value.replace(/`+/g, '');
  value = value.replace(/\*{1,2}/g, '');
  value = repairAnswerStructure(value);
  return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** @deprecated use sanitizeRagAnswer */
export function repairBrokenMarkdown(text = '') {
  return sanitizeRagAnswer(text);
}

/** @deprecated alias */
export function repairSectionStructure(text = '') {
  return repairAnswerStructure(text);
}
