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

export const RAG_SYSTEM_RULES = `你只能使用下方【资料片段】内的信息回答，禁止调用模型自身预训练知识。
1. 回答内容里，每一处引用资料的句子末尾标注对应片段编号，格式严格为 [1][2][3]…（与下方资料片段编号一致）。
2. 综合多份资料回答时，每条信息都要带上对应的数字标记；不要写文档名称，也不要输出末尾汇总参考列表。
3. 如果资料片段没有相关信息，直接回复：暂无相关资料，禁止编造任何内容。
4. 遇到多文档信息冲突时，分别标注不同来源的观点，不要自行合并成单一结论；严格遵守输出格式。`;

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
  if (q.length <= 10) return true;
  return /^(那|所以|然后|还有|继续)|它|他|她|这[个些]|那[个些]|上述|上面|刚才|同上|同样|此/.test(q);
}

/**
 * Build retrieval query from current question.
 * - Standalone questions: current only (avoids prior-topic pollution).
 * - Deixis / ultra-short follow-ups: soft hint from last user turn's key terms only.
 * LLM chat history is unchanged and still carries full conversational context.
 */
export function buildRetrievalQuery(currentQuestion, recentUserQuestions = []) {
  const current = String(currentQuestion || '').trim();
  if (!current) return '';
  if (!needsRetrievalContext(current)) return current;

  const prior = (Array.isArray(recentUserQuestions) ? recentUserQuestions : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-1);
  if (!prior.length) return current;

  const hintTerms = extractQueryTerms(prior[0]).slice(0, 4);
  if (!hintTerms.length) return current;
  return `${hintTerms.join(' ')}\n${current}`;
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
    (list || []).forEach((row, index) => {
      const id = row?.chunk_id;
      if (!id) return;
      const add = 1 / (rrfK + index + 1);
      scores.set(id, (scores.get(id) || 0) + add);
      if (!items.has(id)) {
        items.set(id, { ...row });
        return;
      }
      const prev = items.get(id);
      // Do not let null/undefined from one path wipe scores from the other.
      items.set(id, {
        ...prev,
        ...row,
        similarity: row.similarity != null ? row.similarity : prev.similarity,
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
  return hits / q.length;
}

function overlapScore(queryText, content) {
  const q = extractQueryTerms(queryText);
  if (!q.length) return 0;
  const c = new Set(extractQueryTerms(content));
  let hits = 0;
  for (const term of q) {
    if (c.has(term)) hits += 1;
  }
  return hits / q.length;
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
  // Align with post-rerank floor: chunks that already passed 0.4 are usable.
  if (rerankScore >= RAG_RERANK_SCORE_FLOOR) return { weak: false, reason: 'ok_rerank' };
  if (ranked.length >= 3 && rerankScore >= 0.3) return { weak: false, reason: 'ok_rerank_pack' };
  return {
    weak: true,
    reason: 'retrieval_too_weak',
    detail: { similarity, keywordRank, rerankScore, titleHit, overlap, vectorFloor },
  };
}

export function isRetrievalTooWeak(ranked, options = {}) {
  return explainRetrievalWeakness(ranked, options).weak;
}

export function buildRagSystemPrompt(snippets = []) {
  const block = (snippets || [])
    .map((s) => `[${s.index}] 《${s.title}》\n${s.content}`)
    .join('\n\n');
  return `${RAG_SYSTEM_RULES}

资料片段：
${block}`;
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
