import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deepseekChat, embedTexts, rerankDocuments, rewriteQueriesWithLlm } from '../_shared/ai.ts';
import { qwenChatWithOptionalSearch } from '../_shared/webSearch.js';
import { focusExcerpt } from '../_shared/chunkText.js';
import {
  buildRagSystemPrompt,
  mapThinkingMode,
  resolveAnswerMode,
} from '../_shared/rag.ts';
import {
  RAG_FINAL_TOP_K,
  RAG_HISTORY_MESSAGES_FOR_LLM,
  RAG_INSUFFICIENT_CONTENT,
  RAG_KEYWORD_RECALL_K,
  RAG_VECTOR_RECALL_K,
  buildRetrievalQuery,
  countByMaterialTitle,
  diversifyByMaterial,
  extractQueryTerms,
  fuseByRrf,
  explainRetrievalWeakness,
  listRetrievalQueries,
  resolveRetrievalQueries,
  summarizeAssistantForRewrite,
  normalizeAnswerMode,
  userQuestionsForRetrievalRewrite,
  historyMessagesForRagLlm,
  historyMessagesForGeneralLlm,
  logRagDebug,
  rerankCandidatesWithFallback,
} from '../_shared/ragRetrieve.js';
import {
  buildCitationRows,
  buildConversationRebindPatch,
  buildGeneralChatSystemContent,
  buildRetrievalSummary,
  canRebindEmptyConversation,
  isPlaceholderTitle,
  normalizeRequestBody,
  persistableWebSources,
  resolveGeneralWebSources,
  resolveRagAnswerOutcome,
  shouldReuseConversation,
  shouldUseQwenGeneralChat,
  stripLeftoverCitationMarkers,
  stripMarkdownForReading,
} from './core.js';

type MatchedChunk = {
  chunk_id: string;
  material_id: string;
  knowledge_base_id: string;
  content: string;
  similarity?: number | null;
  keyword_rank?: number | null;
  rrf_score?: number;
  rerank_score?: number;
  material_title: string;
  knowledge_base_name: string;
};

type ChatHistoryMessage = {
  role: 'user' | 'assistant' | string;
  content: string;
  answer_mode?: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function citationResponse(order: number, chunk: MatchedChunk, answer: string) {
  return {
    order,
    materialId: chunk.material_id,
    knowledgeBaseId: chunk.knowledge_base_id,
    title: chunk.material_title,
    knowledgeBaseName: chunk.knowledge_base_name,
    chunkId: chunk.chunk_id,
    excerpt: focusExcerpt(chunk.content, { answer, order, max: 160 }),
  };
}

function formatFullPrompt(
  systemPrompt: string,
  history: ChatHistoryMessage[],
  userQuestion: string,
) {
  const historyBlock = history
    .map((msg) => `${msg.role}: ${msg.content}`)
    .join('\n');
  return [
    '=== system ===',
    systemPrompt,
    '=== history ===',
    historyBlock || '(none)',
    '=== user ===',
    userQuestion,
  ].join('\n');
}

async function persistInsufficient(admin: ReturnType<typeof createClient>, messageBase: Record<string, unknown>, retrievalSummary: ReturnType<typeof buildRetrievalSummary>) {
  const { data: assistantMessage, error } = await admin
    .from('chat_messages')
    .insert({
      ...messageBase,
      role: 'assistant',
      content: RAG_INSUFFICIENT_CONTENT,
      retrieval_summary: retrievalSummary,
      is_insufficient: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return assistantMessage;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return response({ error: 'missing authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: 'Supabase function environment is incomplete' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: 'unauthorized' }, 401);

  let body;
  try {
    body = normalizeRequestBody(await req.json());
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'invalid request' }, 400);
  }

  const user = userData.user;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  let insertedUserMessageId: string | null = null;
  let insertedAssistantMessageId: string | null = null;

  try {
    let conversationId = body.conversationId;
    let reuseConversation = false;
    if (conversationId) {
      const { data: conversation, error } = await admin
        .from('chat_conversations')
        .select('id, title, surface, knowledge_base_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!conversation) return response({ error: 'conversation not found' }, 404);

      const { count: messageCount, error: countError } = await admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);
      if (countError) throw countError;

      if (shouldReuseConversation(conversation, body)) {
        reuseConversation = true;
      } else if (canRebindEmptyConversation(conversation, body, messageCount || 0)) {
        const patch = buildConversationRebindPatch(conversation, body);
        if (patch) {
          const { error: rebindError } = await admin
            .from('chat_conversations')
            .update(patch)
            .eq('id', conversationId);
          if (rebindError) throw rebindError;
        }
        reuseConversation = true;
      } else {
        // Wrong surface/KB → start a new thread instead of mixing histories.
        conversationId = undefined;
      }

      if (reuseConversation) {
        if (
          body.surface === 'knowledge'
          && body.knowledgeBaseIds.length === 0
          && conversation.knowledge_base_id
        ) {
          body = {
            ...body,
            knowledgeBaseIds: [conversation.knowledge_base_id],
          };
        }
        if ((messageCount || 0) === 0 && isPlaceholderTitle(conversation.title)) {
          await admin
            .from('chat_conversations')
            .update({ title: body.content.slice(0, 60) })
            .eq('id', conversationId);
        }
      }
    }
    if (!reuseConversation) {
      const insertRow: Record<string, unknown> = {
        user_id: user.id,
        title: body.content.slice(0, 60),
        surface: body.surface,
      };
      if (body.surface === 'knowledge' && body.knowledgeBaseIds.length) {
        insertRow.knowledge_base_id = body.knowledgeBaseIds[0];
      }
      const { data: conversation, error } = await admin
        .from('chat_conversations')
        .insert(insertRow)
        .select('id')
        .single();
      if (error) throw error;
      conversationId = conversation.id;
    }

    const answerMode = resolveAnswerMode(body);
    // Visible bubble / DB may keep #tags; retrieval & LLM use ask text.
    const askText = String(body.retrievalContent || body.content || '').trim() || body.content;

    await admin
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Load prior turns before inserting the current user message.
    const { data: priorMessages, error: priorError } = await admin
      .from('chat_messages')
      .select('role, content, answer_mode')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(RAG_HISTORY_MESSAGES_FOR_LLM);
    if (priorError) throw priorError;
    const historyAsc = ([...(priorMessages || [])] as ChatHistoryMessage[]).reverse();
    const recentUserQuestions = userQuestionsForRetrievalRewrite(historyAsc, askText);

    const messageBase = {
      conversation_id: conversationId,
      user_id: user.id,
      answer_mode: answerMode,
      tag_filters: body.tagFilters,
    };
    const { data: userMessage, error: userMessageError } = await admin
      .from('chat_messages')
      .insert({ ...messageBase, role: 'user', content: body.content })
      .select('id')
      .single();
    if (userMessageError) throw userMessageError;
    insertedUserMessageId = userMessage.id;

    if (answerMode === 'general') {
      const useQwen = shouldUseQwenGeneralChat(body);
      let plainAnswer: string;
      let webSources: { order: number; title: string; url: string }[] = [];

      const generalHistory = historyMessagesForGeneralLlm(historyAsc, askText);
      const messages = [
        { role: 'system', content: buildGeneralChatSystemContent(body.onlineEnabled) },
        ...generalHistory.map((msg) => ({
          role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: msg.content,
        })),
        { role: 'user', content: askText },
      ];

      if (useQwen) {
        const result = await qwenChatWithOptionalSearch(messages, {
          onlineEnabled: body.onlineEnabled === true,
        });
        plainAnswer = stripLeftoverCitationMarkers(stripMarkdownForReading(result.content));
        webSources = resolveGeneralWebSources(body.onlineEnabled === true, result.webSources);
      } else {
        const answer = await deepseekChat(messages, { model: mapThinkingMode(body.thinkingMode) });
        plainAnswer = stripLeftoverCitationMarkers(stripMarkdownForReading(answer));
      }

      const { data: assistantMessage, error } = await admin
        .from('chat_messages')
        .insert({
          ...messageBase,
          role: 'assistant',
          content: plainAnswer,
          is_insufficient: false,
          web_sources: persistableWebSources(webSources),
        })
        .select('id')
        .single();
      if (error) throw error;
      insertedAssistantMessageId = assistantMessage.id;
      return response({
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        answerMode,
        content: plainAnswer,
        insufficient: false,
        citations: [],
        webSources,
      });
    }

    const recentAssistantRaw = [...historyAsc]
      .reverse()
      .find((msg) => msg?.role === 'assistant' && normalizeAnswerMode(msg?.answer_mode) === 'rag');
    const recentAssistant = summarizeAssistantForRewrite(recentAssistantRaw?.content || '');

    const rewriteResult = await resolveRetrievalQueries({
      current: askText,
      recentUser: recentUserQuestions,
      recentAssistant,
      rewriteFn: rewriteQueriesWithLlm,
    });
    const retrievalQueries = rewriteResult.queries.length
      ? rewriteResult.queries
      : listRetrievalQueries(askText, recentUserQuestions);
    const retrievalQuery = retrievalQueries[0] || buildRetrievalQuery(askText, recentUserQuestions);
    const parentScopeFallback = rewriteResult.source === 'rules_fallback'
      && rewriteResult.kind === 'submodule_attribute';

    console.log('[rag-debug] query_rewrite_input=', JSON.stringify(rewriteResult.input));
    console.log('[rag-debug] query_rewrite_output=', JSON.stringify({
      queries: rewriteResult.queries,
      is_followup: rewriteResult.is_followup,
      source: rewriteResult.source,
      kind: rewriteResult.kind,
    }));
    if (rewriteResult.fallback) {
      console.log('[rag-debug] query_rewrite_fallback=', JSON.stringify(rewriteResult.fallback));
    }
    if (rewriteResult.dropped?.length) {
      console.log('[rag-debug] query_rewrite_dropped=', JSON.stringify(rewriteResult.dropped));
    }
    console.log('[rag-debug] rewrite_latency_ms=', rewriteResult.rewrite_latency_ms);
    const queryEmbeddings = await embedTexts(retrievalQueries);
    if (!queryEmbeddings.length || queryEmbeddings.some((item) => !item)) {
      throw new Error('query embedding was not returned');
    }

    const filterKbIds = body.knowledgeBaseIds.length ? body.knowledgeBaseIds : null;
    const requestedTagIds = body.tagFilters.length ? body.tagFilters : null;
    const queryTerms = [...new Set(retrievalQueries.flatMap((query) => extractQueryTerms(query)))];

    // User asked with #tags: keep the looser gate even after soft-fallback drops the
    // hard tag filter. Otherwise fallback chunks get judged with the strict floor and
    // flip to「暂无相关资料」on the first try (second try often "works" via history noise).
    const userTagScoped = Boolean(requestedTagIds?.length);
    const runRecall = async (filterTagIds: string[] | null) => {
      const vectorRequests = queryEmbeddings.map((queryEmbedding) => admin.rpc('match_material_chunks', {
        query_embedding: queryEmbedding,
        match_count: RAG_VECTOR_RECALL_K,
        filter_user: user.id,
        filter_kb_ids: filterKbIds,
        filter_tag_ids: filterTagIds,
      }));
      const keywordRequest = queryTerms.length
        ? admin.rpc('match_material_chunks_keyword', {
          query_terms: queryTerms,
          match_count: RAG_KEYWORD_RECALL_K,
          filter_user: user.id,
          filter_kb_ids: filterKbIds,
          filter_tag_ids: filterTagIds,
        })
        : Promise.resolve({ data: [], error: null });

      const settled = await Promise.all([...vectorRequests, keywordRequest]);
      const keywordResult = settled[settled.length - 1];
      const vectorResults = settled.slice(0, -1);
      for (const result of vectorResults) {
        if (result.error) throw result.error;
      }
      if (keywordResult.error) throw keywordResult.error;

      const vectorHits = vectorResults.flatMap((result) => (result.data || []) as MatchedChunk[]);
      const keywordHits = (keywordResult.data || []) as MatchedChunk[];
      const vectorRankLists = vectorResults.map((result) => (result.data || []) as MatchedChunk[]);
      const rrfFused = fuseByRrf([...vectorRankLists, keywordHits]) as MatchedChunk[];
      const rrfDiversified = diversifyByMaterial(rrfFused) as MatchedChunk[];
      const { ranked: reranked, provider: rerankProvider } = await rerankCandidatesWithFallback(
        rrfDiversified,
        retrievalQuery,
        {
          topK: RAG_FINAL_TOP_K,
          rerankFn: rerankDocuments,
        },
      ) as { ranked: MatchedChunk[]; provider: string };
      const chunks = reranked.slice(0, RAG_FINAL_TOP_K);
      const tooWeakInfo = explainRetrievalWeakness(chunks, {
        queryText: retrievalQuery,
        tagScoped: userTagScoped || Boolean(filterTagIds?.length),
      });
      return {
        filterTagIds,
        vectorHits,
        keywordHits,
        rrfFused,
        rrfDiversified,
        reranked,
        rerankProvider,
        chunks,
        tooWeakInfo,
      };
    };

    let recall = await runRecall(requestedTagIds);
    // Soft fallback: #tags hard-filter can miss when materials aren't tagged that way.
    // Retry once inside the same KB without tag filters so tagged asks still answer.
    if (
      requestedTagIds?.length
      && (!recall.chunks.length || recall.tooWeakInfo.weak)
    ) {
      console.log('[rag-debug] tag_filter_fallback=without_tags', recall.tooWeakInfo);
      const fallback = await runRecall(null);
      // Prefer whichever recall is usable; only replace when fallback is at least as good.
      if (
        (!fallback.tooWeakInfo.weak && recall.tooWeakInfo.weak)
        || (fallback.chunks.length > 0 && recall.chunks.length === 0)
        || (
          !fallback.tooWeakInfo.weak
          && !recall.tooWeakInfo.weak
          && fallback.chunks.length >= recall.chunks.length
        )
      ) {
        recall = fallback;
      }
    }

    const {
      vectorHits,
      keywordHits,
      rrfFused,
      rrfDiversified,
      reranked,
      rerankProvider,
      chunks,
      tooWeakInfo,
      filterTagIds: effectiveTagIds,
    } = recall;
    console.log('[rag-debug] rerank_provider=', rerankProvider);
    console.log('[rag-debug] retrieval_queries=', JSON.stringify(retrievalQueries));
    console.log('[rag-debug] tag_filter_effective=', JSON.stringify(effectiveTagIds));
    const retrievalSummary = buildRetrievalSummary(chunks);
    const rrfByTitle = countByMaterialTitle(rrfFused);
    const rrfDiversifiedByTitle = countByMaterialTitle(rrfDiversified);
    const rerankedByTitle = countByMaterialTitle(reranked);
    const topByTitle = countByMaterialTitle(chunks);

    if (!chunks.length || tooWeakInfo.weak) {
      const gateReason = !chunks.length ? '无参考片段' : (tooWeakInfo.reason || 'retrieval_too_weak');
      console.log('[rag-debug] outcome_reason=', gateReason, tooWeakInfo.detail || '');
      logRagDebug({
        userQuestion: askText,
        retrievalQuery,
        vectorHits,
        keywordHits,
        rrfFused,
        rrfByTitle,
        rrfDiversified,
        rrfDiversifiedByTitle,
        reranked,
        rerankedByTitle,
        topChunks: chunks,
        topByTitle,
        fullLlmPrompt: null,
        llmRaw: null,
      });
      const assistantMessage = await persistInsufficient(admin, messageBase, retrievalSummary);
      insertedAssistantMessageId = assistantMessage.id;
      return response({
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        answerMode,
        content: RAG_INSUFFICIENT_CONTENT,
        insufficient: true,
        citations: [],
      });
    }

    const systemPrompt = buildRagSystemPrompt(chunks.map((chunk, index) => ({
      index: index + 1,
      content: chunk.content,
      title: chunk.material_title,
    })), {
      // Only submodule-attribute follow-ups may use the「该模块没有…整体技术」opener.
      parentScopeFallback,
    });
    const ragHistory = historyMessagesForRagLlm(
      historyAsc,
      askText,
      rewriteResult.source === 'llm' ? { forceFollowUp: rewriteResult.is_followup } : {},
    );
    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...ragHistory.map((msg) => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: msg.content,
      })),
      { role: 'user' as const, content: askText },
    ];
    const fullLlmPrompt = formatFullPrompt(systemPrompt, ragHistory, askText);
    logRagDebug({
      userQuestion: askText,
      retrievalQuery,
      vectorHits,
      keywordHits,
      rrfFused,
      rrfByTitle,
      rrfDiversified,
      rrfDiversifiedByTitle,
      reranked,
      rerankedByTitle,
      topChunks: chunks,
      topByTitle,
      fullLlmPrompt,
      llmRaw: null,
    });

    let activeChunks = chunks;
    let answer = await deepseekChat(llmMessages, { model: mapThinkingMode(body.thinkingMode) });
    console.log('[rag-debug] llm_raw=\n', answer);
    let answerOutcome = resolveRagAnswerOutcome({ answer, chunks: activeChunks });

    // Tagged ask retrieved something the model still refused: broaden once without tags.
    if (
      answerOutcome.isInsufficient
      && requestedTagIds?.length
      && effectiveTagIds != null
    ) {
      console.log('[rag-debug] llm_insufficient_tag_retry=without_tags');
      const broadened = await runRecall(null);
      if (!broadened.tooWeakInfo.weak && broadened.chunks.length) {
        activeChunks = broadened.chunks;
        const retryPrompt = buildRagSystemPrompt(activeChunks.map((chunk, index) => ({
          index: index + 1,
          content: chunk.content,
          title: chunk.material_title,
        })), {
          parentScopeFallback,
        });
        const retryMessages = [
          { role: 'system' as const, content: retryPrompt },
          ...ragHistory.map((msg) => ({
            role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: msg.content,
          })),
          { role: 'user' as const, content: askText },
        ];
        answer = await deepseekChat(retryMessages, { model: mapThinkingMode(body.thinkingMode) });
        console.log('[rag-debug] llm_raw_retry=\n', answer);
        answerOutcome = resolveRagAnswerOutcome({ answer, chunks: activeChunks });
      }
    }

    console.log(
      '[rag-debug] outcome_reason=',
      answerOutcome.reason,
      '| isInsufficient=',
      answerOutcome.isInsufficient,
      '| orders=',
      answerOutcome.orders,
    );
    const finalRetrievalSummary = buildRetrievalSummary(activeChunks);
    const { data: assistantMessage, error: assistantError } = await admin
      .from('chat_messages')
      .insert({
        ...messageBase,
        role: 'assistant',
        content: answerOutcome.content,
        retrieval_summary: finalRetrievalSummary,
        is_insufficient: answerOutcome.isInsufficient,
      })
      .select('id')
      .single();
    if (assistantError) throw assistantError;
    insertedAssistantMessageId = assistantMessage.id;

    const citationOrders = answerOutcome.orders;
    const citationRows = buildCitationRows(
      assistantMessage.id,
      citationOrders,
      activeChunks,
      answerOutcome.content,
    );
    if (citationRows.length) {
      const { error: citationsError } = await admin.from('message_citations').insert(citationRows);
      if (citationsError) throw citationsError;
    }

    return response({
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      answerMode,
      content: answerOutcome.content,
      insufficient: answerOutcome.isInsufficient,
      citations: citationOrders.map((order) => citationResponse(order, activeChunks[order - 1], answerOutcome.content)),
    });
  } catch (error) {
    // Best-effort rollback keeps retries from accumulating a partial exchange.
    try {
      if (insertedAssistantMessageId) {
        await admin.from('chat_messages').delete().eq('id', insertedAssistantMessageId);
      } else if (insertedUserMessageId) {
        await admin.from('chat_messages').delete().eq('id', insertedUserMessageId);
      }
    } catch {
      // Preserve the original failure even if cleanup cannot reach Supabase.
    }
    return response({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
