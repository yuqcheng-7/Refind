/**
 * Multi-recall fusion, light rerank, and RAG prompt helpers (Node + Deno).
 */

export const RAG_INSUFFICIENT_CONTENT = '暂无相关资料';
/** Default prompt topN after rerank+floor. Ops band: 6–10 (raise to 10 if recall miss; lower to 6 if conflict/noise). Never >10. */
export const RAG_FINAL_TOP_K = 8;
export const RAG_FINAL_TOP_K_MAX = 10;
export const RAG_FINAL_TOP_K_MIN = 6;
export const RAG_VECTOR_RECALL_K = 20;
export const RAG_KEYWORD_RECALL_K = 20;
export const RAG_RRF_K = 60;
export const RAG_VECTOR_SOFT_FLOOR = 0.28;
/** Drop reranked chunks below this relevance score before taking topN. */
export const RAG_RERANK_SCORE_FLOOR = 0.4;
export const RAG_HISTORY_USER_TURNS_FOR_QUERY = 2;
export const RAG_HISTORY_MESSAGES_FOR_LLM = 6;
export const RAG_MAX_PER_MATERIAL = 3;
export const RAG_RERANK_CANDIDATE_CAP = 40;
/** Pre-rerank diversify: same material_id keeps at most this many after RRF. */
export const RAG_PRE_RERANK_MAX_PER_MATERIAL = 3;

const STOPWORDS = new Set([
  '的', '了', '吗', '呢', '啊', '吧', '是', '在', '和', '与', '或', '及',
  '什么', '什么是', '怎么', '如何', '哪些', '这个', '那个', '一个', '一下', '是什么', '请问',
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'for', 'on', 'and', 'or',
]);

export const RAG_PARENT_SCOPE_OPENER = '知识库中没有该模块单独对应的技术描述，以下是产品整体相关技术信息。';

/** Base rules for every RAG turn (no parent-scope / 子模块 framing). */
export const RAG_SYSTEM_RULES_BASE = `你是知识库问答助手。只能依据下方【资料片段】回答。

输出格式（系统会清洗残缺 Markdown；请按下列结构写，减少符号）：
- 大标题：只用「一、二、三、」（约 12 字，单独成行）。大标题下才能跟小分点；禁止小分点后再套「一、二、三、」。
- 小分点：有先后用「1. 2. 3. 4.」（阿拉伯数字必须递增，数字后空格）；并列无序用「· 」。禁止多个「1.」并列。
- 短标题（加粗标签）：仅当一条分点需要先「命名」再展开时使用。标题 2～12 字（名词/动宾，不含。！？），格式为 **短标题：** 后接正文（正文不加粗）。例：· **精准问答与答案溯源：** 说明文字。
- 不要硬造短标题：整句说明、举例、因果直接写正文；没有独立主题就不要拆标题。
- 禁止「一、标题1.」「……。二、标题」粘行；换段必须换行。
- 加粗尽量少用；短标题以外若用加粗，只包 2～8 字短词且必须成对。引用写在加粗外；不要把「1. xxx」整行加粗。
- 不要输出单独的 * / **，不要把整句包进加粗；不要末尾汇总参考列表。
- 可用 ## 标题；不要依赖斜体 / 代码块。

回答优先级与边界：
1. 优先使用检索到的 chunk 原文信息回答；关键结论在句号（。！？）后面标注片段编号，如：……结论。[1][2]；不要写成 ……结论[1]。或 ……结论 [1]。；不要写文档名称，不要输出末尾汇总参考列表。
2. 如果完全没有相关信息，才回复：暂无相关资料。问题更具体但资料仍有相关主题时，用资料能支撑的部分回答并标注 [n]，不要因为无法覆盖全部约束就直接回复暂无相关资料。
3. 严禁编造知识库不存在的内容；不得调用模型自身预训练知识补充事实。

其它：
- 多文档冲突时分别标注不同来源观点，不要擅自合并成单一结论。
- 用户表示不明白或要求更详细时，基于同一批资料讲清楚并继续在句号后标注 [n]，不要因此直接回复暂无相关资料。`;

/** Extra rule only for submodule-attribute follow-ups (rewrite kind = submodule_attribute). */
export const RAG_SYSTEM_RULES_PARENT_SCOPE = `补充（仅当用户在追问先前讨论的子模块/部件的属性时适用）：
- 如果没有用户询问的【子项单独信息】，但存在该子项所属整体的相关信息：可以使用整体信息回答，并且开头必须说明：「${RAG_PARENT_SCOPE_OPENER}」然后再写整体相关内容并标注 [n]。
- 独立新问题（如「大模型是什么」）不得使用上述「模块/整体」开场白。`;

/** @deprecated Prefer buildRagSystemPrompt({ parentScopeFallback }). Kept for tests that match the combined default. */
export const RAG_SYSTEM_RULES = `${RAG_SYSTEM_RULES_BASE}

${RAG_SYSTEM_RULES_PARENT_SCOPE}`;

export function extractQueryTerms(text = '') {
  const raw = String(text || '').toLowerCase();
  const parts = raw.match(/[\u4e00-\u9fff]{2,}|[a-z0-9]{2,}/g) || [];
  const terms = [];
  const seen = new Set();
  const push = (token) => {
    if (!token || token.length < 2 || STOPWORDS.has(token) || seen.has(token)) return;
    seen.add(token);
    terms.push(token);
  };
  for (const part of parts) {
    let token = part;
    if (/^[\u4e00-\u9fff]+$/.test(token)) {
      token = token.replace(/[呢吗吧啊了的]+$/g, '');
      // Long CN spans (e.g. 请问大模型是什么) → also emit 2-grams for matching.
      if (token.length >= 4) {
        for (let i = 0; i <= token.length - 2 && terms.length < 12; i += 1) {
          push(token.slice(i, i + 2));
        }
      }
      push(token);
    } else {
      push(token);
    }
    if (terms.length >= 12) break;
  }
  return terms.slice(0, 12);
}

/** Follow-ups that need deixis help for retrieval (not full prior-question concat). */
export function needsRetrievalContext(question = '') {
  const q = String(question || '').trim();
  if (!q) return false;
  if (isClarificationFollowUp(q)) return true;
  // Short *follow-up fragments* need prior context; complete topic asks like
  // 「大模型是什么」must stay standalone or prior general/online turns pollute RAG.
  const deixisOrContinue = /^(那|所以|然后|还有|继续|为什么|为何|怎么|怎样)|它|他|她|这[个些]?|那[个些]?|上述|上面|刚才|同上|同样|此/.test(q);
  if (q.length <= 10) return deixisOrContinue;
  return /^(那|所以|然后|还有|继续)|它|他|她|这[个些]|那[个些]|上述|上面|刚才|同上|同样|此/.test(q);
}

/** Normalize persisted answer_mode; legacy null rows count as rag. */
export function normalizeAnswerMode(answerMode) {
  return answerMode === 'general' ? 'general' : 'rag';
}

/**
 * Strip RAG citation markers so prior KB answers can safely feed general/online LLM.
 */
export function sanitizeHistoryContentForLlm(msg = {}) {
  let content = String(msg?.content || '');
  if (normalizeAnswerMode(msg?.answer_mode) === 'rag' && msg?.role === 'assistant') {
    content = content
      .replace(/\[(\d+)\]/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }
  return content;
}

/**
 * Full recent transcript (citation markers stripped from prior RAG answers).
 */
export function historyMessagesForLlm(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  return list.map((msg) => ({
    role: msg?.role === 'assistant' ? 'assistant' : 'user',
    content: sanitizeHistoryContentForLlm(msg),
    answer_mode: msg?.answer_mode,
  }));
}

/** Trailing contiguous turns of one mode (legacy null → rag). */
export function trailingModeHistory(messages = [], answerMode = 'rag') {
  const target = normalizeAnswerMode(answerMode);
  const list = Array.isArray(messages) ? messages : [];
  const out = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    if (!msg) continue;
    if (normalizeAnswerMode(msg.answer_mode) !== target) break;
    out.push(msg);
  }
  return out.reverse();
}

/** True when the ask depends on prior turns (cross-mode追问 must keep history). */
export function isContextualFollowUp(question = '') {
  const q = String(question || '').trim();
  if (!q) return false;
  return isClarificationFollowUp(q)
    || isScopedAttributeFollowUp(q)
    || needsRetrievalContext(q);
}

/**
 * User questions for retrieval rewrite.
 * Prefer the trailing RAG segment after a mode switch; only fall back to
 * other-mode asks when the current turn is a cross-mode追问 with no RAG yet.
 */
export function userQuestionsForRetrievalRewrite(messages = [], currentQuestion = '') {
  const list = Array.isArray(messages) ? messages : [];
  const fromMode = (mode) => trailingModeHistory(list, mode)
    .filter((msg) => msg?.role === 'user')
    .map((msg) => String(msg.content || '').trim())
    .filter(Boolean);
  const ragQuestions = fromMode('rag');
  if (ragQuestions.length) return ragQuestions;
  if (isContextualFollowUp(currentQuestion)) {
    return list
      .filter((msg) => msg?.role === 'user')
      .map((msg) => String(msg.content || '').trim())
      .filter(Boolean);
  }
  return [];
}

/** Bridge prior other-mode user asks into RAG when the KB segment is still empty. */
export function crossModeUserBridge(messages = [], limit = 4) {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .filter((msg) => msg?.role === 'user')
    .slice(-Math.max(1, limit))
    .map((msg) => ({
      role: 'user',
      content: String(msg.content || '').trim(),
      answer_mode: msg?.answer_mode,
    }))
    .filter((msg) => msg.content);
}

/**
 * Meta follow-ups that ask to re-explain / expand prior answer (not a new topical question).
 * These must NOT be embedded/reranked as the retrieval query — they match no KB chunks.
 */
export function isClarificationFollowUp(question = '') {
  const q = String(question || '')
    .trim()
    .replace(/[?？!！。．\s]+$/g, '')
    .replace(/[呀啊呢吗吧啦]+$/g, '');
  if (!q) return false;
  if (/不明白|看不懂|没看懂|听不懂|不太懂|没懂|不懂|什么意思|啥意思|再解释|解释一下|详细(一点|说说|解释)?|再(详细|说|讲)|展开(一下|说说)?|讲清楚|说清楚|怎么理解|为何这么说|为什么这么说|没看明白|还是不懂|还是不明白/.test(q)) {
    return true;
  }
  // Detail-only追问:「具体是什么 / 都有哪些」— no noun topic of its own
  if (/^(那)?(具体(是什么|有哪些|呢|说说?|讲讲?|说一下|一下)?|都有哪些|还有哪些|是哪些|哪几个|分别(是什么|有哪些)|都是什么|列举(一下)?)$/.test(q)) {
    return true;
  }
  return q.length <= 16 && /明白|不懂|详细|解释|展开/.test(q);
}

/**
 * Follow-ups that ask an attribute of a previously discussed entity
 * (e.g. "这个模块是什么技术生成的").
 */
export function isScopedAttributeFollowUp(question = '') {
  const q = String(question || '').trim();
  if (!q || isClarificationFollowUp(q)) return false;
  // Do not treat「应该」as deixis「该」.
  const hasDeixis = /这[个些]|该(?:个|模块|功能|部分|页面|能力|组件|流程)|上述|上面的|刚才的|同一/.test(q);
  const hasEntity = /模块|功能|部分|页面|能力|组件|流程|环节|特性/.test(q);
  const hasAttribute = /技术|生成|实现|做成|用什么|怎么做|如何做|基于|架构|模型|算法|引擎/.test(q);
  if (hasDeixis && hasAttribute) return true;
  if (hasDeixis && hasEntity && /具体|内容|细节|原理|来源/.test(q)) return true;
  return false;
}

export function lastSubstantiveUserQuestion(recentUserQuestions = []) {
  const list = (Array.isArray(recentUserQuestions) ? recentUserQuestions : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const q = list[i];
    if (isClarificationFollowUp(q)) continue;
    if (q.length <= 4 && needsRetrievalContext(q)) continue;
    return q;
  }
  return '';
}

/** Rule 1: restore deixis/clarification ask to the last full topic question. */
export function restoreTopicQuestion(currentQuestion, recentUserQuestions = []) {
  const current = String(currentQuestion || '').trim();
  const topic = lastSubstantiveUserQuestion(recentUserQuestions);
  return topic || current;
}

/**
 * Rule 2①: submodule-scoped question = prior submodule topic + current attribute ask.
 */
export function buildSubmoduleAttributeQuery(topicQuestion = '', currentQuestion = '') {
  const topic = String(topicQuestion || '').trim();
  const current = String(currentQuestion || '').trim();
  if (!topic) return current;
  if (!current) return topic;
  if (topic === current) return topic;
  return `${topic}\n${current}`;
}

/**
 * Rule 2②: parent/product-level global question for the same attribute.
 */
export function buildParentGlobalQuery(topicQuestion = '', currentQuestion = '') {
  const topic = String(topicQuestion || '').trim();
  const current = String(currentQuestion || '').trim();
  const attrPrefer = current.match(/技术|生成|实现|架构|模型|算法|引擎|检索|向量|做成|基于/g) || [];
  const attrTerms = [
    ...attrPrefer,
    ...extractQueryTerms(current).filter((token) => !/^(这|那|该|个|些|的|了|吗|呢|什么|怎么|如何)$/.test(token)),
  ];
  const seen = new Set();
  const unique = [];
  for (const token of attrTerms) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= 8) break;
  }
  const attrText = unique.length ? unique.join(' ') : '技术 实现 架构';
  const parentHint = (topic.match(/产品|系统|平台|应用|整体/) || [])[0] || '产品';
  return `${parentHint} 整体 系统 ${attrText}`;
}

/**
 * Primary retrieval query = first rewritten query.
 */
export function buildRetrievalQuery(currentQuestion, recentUserQuestions = []) {
  const { queries } = rewriteRetrievalQueries(currentQuestion, recentUserQuestions);
  return queries[0] || String(currentQuestion || '').trim();
}

/**
 * Strip common how-to endings so a long ask still recalls by core topic.
 * Example:「AI产品经理做本地的AI产品应该要怎么做？」→「AI产品经理做本地的AI产品」
 */
export function coreTopicQuery(question = '') {
  let value = String(question || '').trim();
  if (!value) return '';
  value = value
    .replace(/[?？!！。．\s]+$/g, '')
    .replace(/(应该)?(要)?怎么(做|办|样|开展|实现)?$/g, '')
    .replace(/如何(做|办|开展|实现|设计)?$/g, '')
    .replace(/有哪些(方法|步骤|要点)?$/g, '')
    .trim();
  return value;
}

/**
 * Query Rewrite → one or more retrieval queries.
 *
 * Rules:
 * 1) 指代/澄清追问 → 还原成 1 条完整主题问句
 * 2) 子模块/子部件属性追问 → 2 条：①子模块问题 ②所属上级产品/主体全局问题
 * 3) 独立新问题 → 当前句；长问另加去尾后的主题句
 * 4) 其它轻量指代 → 关键词软提示 + 当前句
 */
/**
 * Visible bubbles keep "#标签 问题"; retrieval askText may be "问题\\n标签".
 * Keep tag names (drop only the #) so repeat asks still match.
 */
export function normalizeAskForCompare(text = '') {
  return String(text || '')
    .replace(/#([^\s#]+)/g, '$1')
    .replace(/\s+/g, '')
    .replace(/[?？!！。．、,，]/g, '')
    .toLowerCase();
}

export function isSameRetrievalAsk(a = '', b = '') {
  const left = normalizeAskForCompare(a);
  const right = normalizeAskForCompare(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Same tokens regardless of "#tag first" vs "question\\ntag" order.
  const sortKey = (value) => [...value].sort().join('');
  return sortKey(left) === sortKey(right);
}

export function rewriteRetrievalQueries(currentQuestion, recentUserQuestions = []) {
  const current = String(currentQuestion || '').trim();
  if (!current) return { kind: 'empty', queries: [] };

  if (isClarificationFollowUp(current)) {
    const topic = restoreTopicQuestion(current, recentUserQuestions);
    // Detail asks benefit from an explicit「具体」cue so recall prefers list/detail chunks
    if (topic && /具体|哪些|哪几|分别|列举/.test(current.replace(/[?？!！。．\s呀啊呢吗吧啦]+$/g, ''))) {
      const detailQuery = `${coreTopicQuery(topic) || topic} 具体`;
      const queries = detailQuery !== topic ? [detailQuery, topic] : [topic];
      return { kind: 'clarification_restore', queries };
    }
    return {
      kind: 'clarification_restore',
      queries: [topic],
    };
  }

  if (isScopedAttributeFollowUp(current)) {
    const topic = lastSubstantiveUserQuestion(recentUserQuestions);
    if (!topic) return { kind: 'submodule_attribute', queries: [current] };
    const submoduleQuery = buildSubmoduleAttributeQuery(topic, current);
    const parentQuery = buildParentGlobalQuery(topic, current);
    const queries = parentQuery && parentQuery !== submoduleQuery
      ? [submoduleQuery, parentQuery]
      : [submoduleQuery];
    return { kind: 'submodule_attribute', queries };
  }

  if (!needsRetrievalContext(current)) {
    const core = coreTopicQuery(current);
    if (core && core !== current && core.length >= 4) {
      return { kind: 'standalone', queries: [current, core] };
    }
    return { kind: 'standalone', queries: [current] };
  }

  const prior = (Array.isArray(recentUserQuestions) ? recentUserQuestions : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-1);
  if (!prior.length) return { kind: 'deixis_soft', queries: [current] };
  // Asking the same complete question again (e.g. after switching into a KB,
  // or re-asking after「暂无相关资料」) must not prepend prior 2-grams.
  if (isSameRetrievalAsk(prior[0], current)) {
    const core = coreTopicQuery(current.split('\n')[0] || current);
    if (core && core !== current && core.length >= 4) {
      return { kind: 'standalone', queries: [current, core] };
    }
    return { kind: 'standalone', queries: [current] };
  }
  const hintTerms = extractQueryTerms(prior[0]).slice(0, 4);
  if (!hintTerms.length) return { kind: 'deixis_soft', queries: [current] };
  return { kind: 'deixis_soft', queries: [`${hintTerms.join(' ')}\n${current}`] };
}

/** @deprecated prefer rewriteRetrievalQueries; kept for call sites expecting string[]. */
export function listRetrievalQueries(currentQuestion, recentUserQuestions = []) {
  return rewriteRetrievalQueries(currentQuestion, recentUserQuestions).queries;
}

export const REWRITE_QUERY_MAX_LEN = 120;
export const REWRITE_ASSISTANT_MAX_LEN = 300;
/** Small default denylist; override via validate options / env list in resolve. */
export const REWRITE_SENSITIVE_DEFAULT = ['忽略以上指令', 'ignore previous instructions'];

/**
 * Local-only assistant snippet for rewrite context (no second LLM call).
 */
export function summarizeAssistantForRewrite(content = '', maxLen = REWRITE_ASSISTANT_MAX_LEN) {
  let value = String(content || '')
    .replace(/\[\d+]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!value) return '';
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

export function validateRewriteQuery(query, {
  maxLen = REWRITE_QUERY_MAX_LEN,
  sensitiveTerms = REWRITE_SENSITIVE_DEFAULT,
} = {}) {
  const text = String(query ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > maxLen) return { ok: false, reason: 'too_long' };
  const lower = text.toLowerCase();
  for (const term of sensitiveTerms || []) {
    const token = String(term || '').trim().toLowerCase();
    if (token && lower.includes(token)) return { ok: false, reason: 'sensitive' };
  }
  return { ok: true, query: text };
}

export function validateRewriteQueries(queries, options = {}) {
  const dropped = [];
  const kept = [];
  const list = Array.isArray(queries) ? queries : [];
  for (const item of list.slice(0, 2)) {
    const result = validateRewriteQuery(item, options);
    if (result.ok) kept.push(result.query);
    else dropped.push({ query: item, reason: result.reason });
  }
  return { queries: kept, dropped };
}

export function parseRewriteLlmContent(content = '') {
  let raw = String(content || '').trim();
  if (!raw) return { ok: false, reason: 'parse' };
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  if (!parsed || !Array.isArray(parsed.queries)) return { ok: false, reason: 'parse' };
  return {
    ok: true,
    queries: parsed.queries,
    is_followup: Boolean(parsed.is_followup),
  };
}

function rulesFallbackPlan(current, recentUser, reason, latencyMs, input, dropped = []) {
  const plan = rewriteRetrievalQueries(current, recentUser);
  return {
    queries: plan.queries.length ? plan.queries : [String(current || '').trim()].filter(Boolean),
    is_followup: isContextualFollowUp(current),
    source: 'rules_fallback',
    kind: plan.kind,
    fallback: { reason },
    dropped,
    rewrite_latency_ms: latencyMs,
    input,
  };
}

function mapRewriteErrorReason(err) {
  const name = err?.name || '';
  const message = String(err?.message || '');
  if (name === 'TimeoutError' || name === 'AbortError' || /aborted|timeout/i.test(message)) {
    return 'timeout';
  }
  if (/DASHSCOPE_API_KEY missing|API_KEY missing|no_key/i.test(message)) return 'no_key';
  if (/failed:\s*\d+/.test(message) || /rewrite failed/i.test(message)) return 'http';
  return 'error';
}

/**
 * Prefer LLM rewrite; per-query validate; all-invalid / errors → rules fallback.
 * `rewriteFn(input) => Promise<string>` returns model content (JSON text).
 */
export async function resolveRetrievalQueries({
  current,
  recentUser = [],
  recentAssistant = '',
  rewriteFn = null,
  sensitiveTerms = REWRITE_SENSITIVE_DEFAULT,
} = {}) {
  const ask = String(current || '').trim();
  const recent = (Array.isArray(recentUser) ? recentUser : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-2);
  const input = { current: ask, recent_user: recent };
  const assistant = summarizeAssistantForRewrite(recentAssistant);
  if (assistant) input.recent_assistant = assistant;

  if (typeof rewriteFn !== 'function') {
    return rulesFallbackPlan(ask, recent, 'no_llm', 0, input);
  }

  const started = Date.now();
  try {
    const content = await rewriteFn(input);
    const latencyMs = Date.now() - started;
    const parsed = parseRewriteLlmContent(content);
    if (!parsed.ok) {
      return rulesFallbackPlan(ask, recent, parsed.reason, latencyMs, input);
    }
    const { queries, dropped } = validateRewriteQueries(parsed.queries, { sensitiveTerms });
    if (!queries.length) {
      return rulesFallbackPlan(ask, recent, 'all_invalid', latencyMs, input, dropped);
    }
    return {
      queries,
      is_followup: parsed.is_followup,
      source: 'llm',
      kind: parsed.is_followup ? 'llm_followup' : 'llm_standalone',
      dropped,
      rewrite_latency_ms: latencyMs,
      input,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    return rulesFallbackPlan(ask, recent, mapRewriteErrorReason(err), latencyMs, input);
  }
}

export function chunkComparableScore(row = {}) {
  if (row.similarity != null && Number.isFinite(Number(row.similarity))) {
    return Number(row.similarity);
  }
  if (row.keyword_rank != null && Number.isFinite(Number(row.keyword_rank))) {
    return 1 / (RAG_RRF_K + Number(row.keyword_rank));
  }
  return 0;
}

/** Keep one row per chunk_id with the highest comparable score (never first-wins). */
export function dedupeChunksByHighestSimilarity(rows = []) {
  const best = new Map();
  for (const row of rows || []) {
    const id = row?.chunk_id;
    if (!id) continue;
    const prev = best.get(id);
    if (!prev || chunkComparableScore(row) > chunkComparableScore(prev)) {
      best.set(id, row);
    }
  }
  return [...best.values()];
}

/**
 * After RRF: keep at most maxPerMaterial chunks per material_id (order preserved).
 */
export function diversifyByMaterial(candidates, {
  maxPerMaterial = RAG_PRE_RERANK_MAX_PER_MATERIAL,
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return [];
  const perMaterial = new Map();
  const out = [];
  for (const row of list) {
    const materialId = row.material_id || '';
    if (!materialId) {
      out.push(row);
      continue;
    }
    const used = perMaterial.get(materialId) || 0;
    if (used >= maxPerMaterial) continue;
    out.push(row);
    perMaterial.set(materialId, used + 1);
  }
  return out;
}

export function countByMaterialTitle(rows = []) {
  const counts = new Map();
  for (const row of rows || []) {
    const title = String(row.material_title || '(unknown)');
    counts.set(title, (counts.get(title) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

export function fuseByRrf(rankLists, { rrfK = RAG_RRF_K } = {}) {
  const scores = new Map();
  const items = new Map();
  for (const list of rankLists || []) {
    const deduped = dedupeChunksByHighestSimilarity(list || []);
    deduped.forEach((row, index) => {
      const id = row?.chunk_id;
      if (!id) return;
      const add = 1 / (rrfK + index + 1);
      scores.set(id, (scores.get(id) || 0) + add);
      if (!items.has(id)) {
        items.set(id, { ...row });
        return;
      }
      const prev = items.get(id);
      const winner = chunkComparableScore(row) > chunkComparableScore(prev) ? row : prev;
      const a = prev.similarity != null ? Number(prev.similarity) : null;
      const b = row.similarity != null ? Number(row.similarity) : null;
      const similarity = a != null && b != null ? Math.max(a, b) : (b != null ? b : a);
      items.set(id, {
        ...prev,
        ...winner,
        similarity: similarity != null ? similarity : winner.similarity,
        keyword_rank: row.keyword_rank != null ? row.keyword_rank : prev.keyword_rank,
      });
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([chunkId, rrfScore]) => ({
      ...items.get(chunkId),
      chunk_id: chunkId,
      rrf_score: rrfScore,
    }));
}

function titleHitScore(queryText, title) {
  const q = extractQueryTerms(queryText);
  const t = String(title || '').toLowerCase();
  if (!q.length || !t) return 0;
  let hits = 0;
  for (const term of q) {
    if (t.includes(term)) hits += 1;
  }
  if (hits === 0) return 0;
  // Long asks emit many 2-grams; don't dilute title matches by full query length.
  return Math.min(1, hits / Math.min(q.length, 4));
}

function overlapScore(queryText, content) {
  const q = extractQueryTerms(queryText);
  if (!q.length) return 0;
  const c = new Set(extractQueryTerms(content));
  let hits = 0;
  for (const term of q) {
    if (c.has(term)) hits += 1;
  }
  if (hits === 0) return 0;
  return Math.min(1, hits / Math.min(q.length, 4));
}

/**
 * Light rerank: weighted similarity + title hit + content overlap + keyword_rank.
 * Enforces per-material diversity and returns up to topK.
 */
export function lightRerank(candidates, queryText, {
  topK = RAG_FINAL_TOP_K,
  maxPerMaterial = RAG_MAX_PER_MATERIAL,
} = {}) {
  const scored = (candidates || []).map((row) => {
    const similarity = Number(row.similarity) || 0;
    const keywordRank = Number(row.keyword_rank) || 0;
    const titleHit = titleHitScore(queryText, row.material_title);
    const overlap = overlapScore(queryText, row.content);
    const score = (
      similarity * 0.45
      + titleHit * 0.15
      + overlap * 0.25
      + Math.min(keywordRank / 10, 1) * 0.1
      + (Number(row.rrf_score) || 0) * 0.05
    );
    return { ...row, rerank_score: score };
  });
  scored.sort((a, b) => b.rerank_score - a.rerank_score);

  const picked = [];
  const perMaterial = new Map();
  for (const row of scored) {
    const materialId = row.material_id || '';
    const used = perMaterial.get(materialId) || 0;
    if (materialId && used >= maxPerMaterial) continue;
    picked.push(row);
    if (materialId) perMaterial.set(materialId, used + 1);
    if (picked.length >= topK) break;
  }
  return picked;
}

/**
 * Drop chunks below rerank score floor, then take topK with per-material cap.
 */
export function selectAfterRerankFloor(scoredRows, {
  topK = RAG_FINAL_TOP_K,
  maxPerMaterial = RAG_MAX_PER_MATERIAL,
  scoreFloor = RAG_RERANK_SCORE_FLOOR,
} = {}) {
  const limit = Math.max(
    RAG_FINAL_TOP_K_MIN,
    Math.min(Number(topK) || RAG_FINAL_TOP_K, RAG_FINAL_TOP_K_MAX),
  );
  const qualified = (scoredRows || [])
    .filter((row) => (Number(row.rerank_score) || 0) >= scoreFloor);
  const picked = [];
  const perMaterial = new Map();
  for (const row of qualified) {
    const materialId = row.material_id || '';
    const used = perMaterial.get(materialId) || 0;
    if (materialId && used >= maxPerMaterial) continue;
    picked.push(row);
    if (materialId) perMaterial.set(materialId, used + 1);
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * Apply Bailian (or any) rerank hits onto candidates; filter by score floor; preserve diversity.
 * results[].index refers to the candidates array order passed to the API.
 */
export function applyExternalRerank(candidates, results, {
  topK = RAG_FINAL_TOP_K,
  maxPerMaterial = RAG_MAX_PER_MATERIAL,
  scoreFloor = RAG_RERANK_SCORE_FLOOR,
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return [];
  const scored = [];
  const seen = new Set();
  for (const hit of results || []) {
    const index = Number(hit?.index);
    if (!Number.isInteger(index) || index < 0 || index >= list.length || seen.has(index)) continue;
    seen.add(index);
    scored.push({
      ...list[index],
      rerank_score: Number(hit.relevance_score) || 0,
    });
  }
  // Keep API order for scored hits; do not append omitted low-relevance leftovers
  // after a successful external rerank — floor filter handles cutoff.
  scored.sort((a, b) => (Number(b.rerank_score) || 0) - (Number(a.rerank_score) || 0));
  return selectAfterRerankFloor(scored, { topK, maxPerMaterial, scoreFloor });
}

/**
 * Prefer external rerank; on failure fall back to local lightRerank.
 * External path scores all candidates (up to 40), filters score < floor, then topK.
 * rerankFn(query, documents, { topN }) -> [{ index, relevance_score }]
 */
export async function rerankCandidatesWithFallback(candidates, queryText, {
  topK = RAG_FINAL_TOP_K,
  maxPerMaterial = RAG_MAX_PER_MATERIAL,
  candidateCap = RAG_RERANK_CANDIDATE_CAP,
  scoreFloor = RAG_RERANK_SCORE_FLOOR,
  rerankFn = null,
  logger = console,
} = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, candidateCap);
  if (!list.length) return { ranked: [], provider: 'empty' };

  if (typeof rerankFn === 'function') {
    try {
      const documents = list.map((row) => {
        const title = String(row.material_title || '').trim();
        const content = String(row.content || '').trim();
        return title ? `《${title}》\n${content}` : content;
      });
      // Score the full candidate set (≤40), then floor-filter + topK.
      const results = await rerankFn(queryText, documents, { topN: list.length });
      const ranked = applyExternalRerank(list, results, { topK, maxPerMaterial, scoreFloor });
      if (ranked.length) {
        return { ranked, provider: 'bailian' };
      }
      logger.log('[rag-debug] bailian_rerank_empty_after_floor → light_fallback');
    } catch (error) {
      logger.log('[rag-debug] bailian_rerank_failed → light_fallback', error instanceof Error ? error.message : String(error));
    }
  }

  const lightScored = lightRerank(list, queryText, {
    topK: list.length,
    maxPerMaterial: list.length,
  });
  // Local heuristic scores are not on the same scale as Bailian relevance;
  // do not apply the 0.4 Bailian floor here — take topK by light score.
  const lightRanked = selectAfterRerankFloor(lightScored, {
    topK,
    maxPerMaterial,
    scoreFloor: 0,
  });
  return {
    ranked: lightRanked,
    provider: 'light_fallback',
  };
}

/**
 * Gate after rerank: empty, or top hit below vector floor without keyword/title signal.
 * Returns { weak, reason } for debug logging.
 */
export function explainRetrievalWeakness(ranked, {
  queryText = '',
  vectorFloor = RAG_VECTOR_SOFT_FLOOR,
  tagScoped = false,
} = {}) {
  if (!Array.isArray(ranked) || ranked.length === 0) {
    return { weak: true, reason: '无参考片段' };
  }
  const top = ranked[0];
  const similarity = Number(top.similarity) || 0;
  const keywordRank = Number(top.keyword_rank) || 0;
  const rerankScore = Number(top.rerank_score) || 0;
  const titleHit = titleHitScore(queryText, top.material_title);
  const overlap = overlapScore(queryText, top.content);

  if (similarity >= vectorFloor) return { weak: false, reason: 'ok_vector' };
  if (keywordRank >= 2) return { weak: false, reason: 'ok_keyword' };
  if (titleHit >= 0.5 && overlap >= 0.3) return { weak: false, reason: 'ok_title_overlap' };
  // Long specific asks often only match the title entity well — still usable.
  if (titleHit >= 0.5 && (overlap >= 0.15 || keywordRank >= 1 || similarity >= 0.12)) {
    return { weak: false, reason: 'ok_title_signal' };
  }
  // Align with post-rerank floor: chunks that already passed 0.4 are usable.
  if (rerankScore >= RAG_RERANK_SCORE_FLOOR) return { weak: false, reason: 'ok_rerank' };
  if (ranked.length >= 3 && rerankScore >= 0.3) return { weak: false, reason: 'ok_rerank_pack' };
  // User picked #tags: trust the scoped recall more than a rigid similarity floor.
  if (tagScoped && (
    similarity >= 0.12
    || keywordRank >= 1
    || titleHit >= 0.25
    || overlap >= 0.2
    || rerankScore >= 0.15
  )) {
    return { weak: false, reason: 'ok_tag_scoped' };
  }
  return {
    weak: true,
    reason: 'retrieval_too_weak',
    detail: { similarity, keywordRank, rerankScore, titleHit, overlap, vectorFloor, tagScoped },
  };
}

export function isRetrievalTooWeak(ranked, options = {}) {
  return explainRetrievalWeakness(ranked, options).weak;
}

export function buildRagSystemPrompt(snippets = [], options = {}) {
  const parentScopeFallback = options.parentScopeFallback === true;
  const rules = parentScopeFallback
    ? `${RAG_SYSTEM_RULES_BASE}\n\n${RAG_SYSTEM_RULES_PARENT_SCOPE}`
    : RAG_SYSTEM_RULES_BASE;
  const block = (snippets || [])
    .map((s) => `[${s.index}] 《${s.title}》\n${s.content}`)
    .join('\n\n');
  return `${rules}

资料片段：
${block}`;
}

/**
 * RAG LLM history — never feed general/online assistant essays (they suppress [n]
 * and collapse into「暂无相关资料」). Keep trailing RAG turns; for a追问 right
 * after switching into KB, bridge prior user questions only.
 *
 * @param {{ forceFollowUp?: boolean }} [options]
 *   forceFollowUp true → always attach RAG/cross-mode history
 *   forceFollowUp false → standalone (no history; avoid prior-turn pollution)
 *   omitted → legacy: rag tail if any, else contextual bridge
 */
export function historyMessagesForRagLlm(messages = [], currentQuestion = '', options = {}) {
  const force = options?.forceFollowUp;
  const ragTail = trailingModeHistory(messages, 'rag');

  if (force === false) return [];

  if (force === true) {
    if (ragTail.length) return historyMessagesForLlm(ragTail);
    return crossModeUserBridge(messages);
  }

  if (ragTail.length) return historyMessagesForLlm(ragTail);
  if (isContextualFollowUp(currentQuestion)) {
    return crossModeUserBridge(messages);
  }
  return [];
}

/**
 * General/online LLM history:
 * - 追问 → 全会话（可承接刚在知识库问过的内容）
 * - 独立新问题 → 仅尾段通用轮次
 */
export function historyMessagesForGeneralLlm(messages = [], currentQuestion = '') {
  if (isContextualFollowUp(currentQuestion)) {
    return historyMessagesForLlm(messages);
  }
  return historyMessagesForLlm(trailingModeHistory(messages, 'general'));
}

export function formatChunksForLog(rows = [], limit = 20) {
  return (rows || []).slice(0, limit).map((row, index) => ({
    rank: index + 1,
    chunk_id: row.chunk_id,
    similarity: row.similarity ?? null,
    keyword_rank: row.keyword_rank ?? null,
    rrf_score: row.rrf_score ?? null,
    rerank_score: row.rerank_score ?? null,
    material_title: row.material_title,
    content: row.content,
  }));
}

export function logRagDebug(payload = {}) {
  const logger = payload.logger || console;
  logger.log('[rag-debug] user_question=', payload.userQuestion);
  logger.log('[rag-debug] retrieval_query=', payload.retrievalQuery);
  logger.log('[rag-debug] vector_hits=', JSON.stringify(formatChunksForLog(payload.vectorHits), null, 2));
  logger.log('[rag-debug] keyword_hits=', JSON.stringify(formatChunksForLog(payload.keywordHits), null, 2));
  logger.log('[rag-debug] rrf_fused=', JSON.stringify(formatChunksForLog(payload.rrfFused), null, 2));
  logger.log('[rag-debug] rrf_by_title=', JSON.stringify(payload.rrfByTitle || countByMaterialTitle(payload.rrfFused)));
  logger.log('[rag-debug] rrf_diversified=', JSON.stringify(formatChunksForLog(payload.rrfDiversified), null, 2));
  logger.log('[rag-debug] rrf_diversified_by_title=', JSON.stringify(payload.rrfDiversifiedByTitle || countByMaterialTitle(payload.rrfDiversified)));
  logger.log('[rag-debug] reranked=', JSON.stringify(formatChunksForLog(payload.reranked), null, 2));
  logger.log('[rag-debug] reranked_by_title=', JSON.stringify(payload.rerankedByTitle || countByMaterialTitle(payload.reranked)));
  logger.log('[rag-debug] top5=', JSON.stringify(formatChunksForLog(payload.topChunks, RAG_FINAL_TOP_K), null, 2));
  logger.log('[rag-debug] top_by_title=', JSON.stringify(payload.topByTitle || countByMaterialTitle(payload.topChunks)));
  if (payload.fullLlmPrompt != null) {
    logger.log('[rag-debug] full_llm_prompt=\n', payload.fullLlmPrompt);
  } else if (payload.fullPrompt != null) {
    // backward-compatible alias
    logger.log('[rag-debug] full_llm_prompt=\n', payload.fullPrompt);
  }
  if (payload.llmRaw != null) {
    logger.log('[rag-debug] llm_raw=\n', payload.llmRaw);
  }
}
