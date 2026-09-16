import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deepseekChat, embedTexts, rerankDocuments } from '../_shared/ai.ts';
import { parseWebSources, qwenChatWithOptionalSearch } from '../_shared/webSearch.js';
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

    await admin
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Load prior turns before inserting the current user message.
    const { data: priorMessages, error: priorError } = await admin
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(RAG_HISTORY_MESSAGES_FOR_LLM);
    if (priorError) throw priorError;
    const historyAsc = ([...(priorMessages || [])] as ChatHistoryMessage[]).reverse();
    const recentUserQuestions = historyAsc
      .filter((msg) => msg.role === 'user')
      .map((msg) => msg.content);

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

      const messages = [
        { role: 'system', content: buildGeneralChatSystemContent(body.onlineEnabled) },
        { role: 'user', content: body.content },
      ];

      if (useQwen) {
        const result = await qwenChatWithOptionalSearch(messages, {
          onlineEnabled: body.onlineEnabled === true,
        });
        plainAnswer = stripMarkdownForReading(result.content);
        webSources = resolveGeneralWebSources(
          body.onlineEnabled === true,
          parseWebSources({ search_results: result.webSources }),
        );
      } else {
        const answer = await deepseekChat(messages, { model: mapThinkingMode(body.thinkingMode) });
        plainAnswer = stripMarkdownForReading(answer);
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

    const retrievalQuery = buildRetrievalQuery(body.content, recentUserQuestions);
    const queryTerms = extractQueryTerms(retrievalQuery);
    const [queryEmbedding] = await embedTexts([retrievalQuery]);
    if (!queryEmbedding) throw new Error('query embedding was not returned');

    const filterKbIds = body.knowledgeBaseIds.length ? body.knowledgeBaseIds : null;
    const filterTagIds = body.tagFilters.length ? body.tagFilters : null;

    const [vectorResult, keywordResult] = await Promise.all([
      admin.rpc('match_material_chunks', {
        query_embedding: queryEmbedding,
        match_count: RAG_VECTOR_RECALL_K,
        filter_user: user.id,
        filter_kb_ids: filterKbIds,
        filter_tag_ids: filterTagIds,
      }),
      queryTerms.length
        ? admin.rpc('match_material_chunks_keyword', {
          query_terms: queryTerms,
          match_count: RAG_KEYWORD_RECALL_K,
          filter_user: user.id,
          filter_kb_ids: filterKbIds,
          filter_tag_ids: filterTagIds,
        })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (vectorResult.error) throw vectorResult.error;
    if (keywordResult.error) throw keywordResult.error;

    const vectorHits = (vectorResult.data || []) as MatchedChunk[];
    const keywordHits = (keywordResult.data || []) as MatchedChunk[];
    const rrfFused = fuseByRrf([vectorHits, keywordHits]) as MatchedChunk[];
    const rrfDiversified = diversifyByMaterial(rrfFused) as MatchedChunk[];
    const { ranked: reranked, provider: rerankProvider } = await rerankCandidatesWithFallback(
      rrfDiversified,
      retrievalQuery,
      {
        topK: RAG_FINAL_TOP_K,
        rerankFn: rerankDocuments,
      },
    ) as { ranked: MatchedChunk[]; provider: string };
    console.log('[rag-debug] rerank_provider=', rerankProvider);
    const chunks = reranked.slice(0, RAG_FINAL_TOP_K);
    const retrievalSummary = buildRetrievalSummary(chunks);
    const rrfByTitle = countByMaterialTitle(rrfFused);
    const rrfDiversifiedByTitle = countByMaterialTitle(rrfDiversified);
    const rerankedByTitle = countByMaterialTitle(reranked);
    const topByTitle = countByMaterialTitle(chunks);

    const tooWeakInfo = explainRetrievalWeakness(chunks, { queryText: retrievalQuery });
    if (!chunks.length || tooWeakInfo.weak) {
      const gateReason = !chunks.length ? '无参考片段' : (tooWeakInfo.reason || 'retrieval_too_weak');
      console.log('[rag-debug] outcome_reason=', gateReason, tooWeakInfo.detail || '');
      logRagDebug({
        userQuestion: body.content,
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
    })));
    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyAsc.map((msg) => ({
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: msg.content,
      })),
      { role: 'user' as const, content: body.content },
    ];
    const fullLlmPrompt = formatFullPrompt(systemPrompt, historyAsc, body.content);
    logRagDebug({
      userQuestion: body.content,
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

    const answer = await deepseekChat(llmMessages, { model: mapThinkingMode(body.thinkingMode) });
    console.log('[rag-debug] llm_raw=\n', answer);

    const answerOutcome = resolveRagAnswerOutcome({ answer, chunks });
    console.log(
      '[rag-debug] outcome_reason=',
      answerOutcome.reason,
      '| isInsufficient=',
      answerOutcome.isInsufficient,
      '| orders=',
      answerOutcome.orders,
    );
    const { data: assistantMessage, error: assistantError } = await admin
      .from('chat_messages')
      .insert({
        ...messageBase,
        role: 'assistant',
        content: answerOutcome.content,
        retrieval_summary: retrievalSummary,
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
      chunks,
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
      citations: citationOrders.map((order) => citationResponse(order, chunks[order - 1], answerOutcome.content)),
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
