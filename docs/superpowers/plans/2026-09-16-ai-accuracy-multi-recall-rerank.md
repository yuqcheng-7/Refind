# AI Accuracy Multi-Recall + Rerank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement A′ RAG: vector+keyword recall, RRF, Bailian `qwen3-rerank` (light fallback), topK≈8 (ops 6–10), deixis-aware multi-turn retrieval, fixed system prompt, debug logs, insufficient short-circuit without LLM.

**Architecture:** Pure helpers in `_shared/ragRetrieve.js` (testable in Node); keyword RPC; `chat-message/index.ts` orchestrates parallel recall → RRF → diversify → rerank → optional DeepSeek with history.

**Tech Stack:** Supabase Edge (Deno), Postgres RPC, DashScope embed + **qwen3-rerank**, DeepSeek chat, Node `node:test` for pure helpers.

**As-built note (2026-09-17):** Design originally targeted local-only light rerank + top≈5 + copy「知识库暂未查询到相关内容」. Shipped deltas: Bailian rerank + light fallback, topK=8, copy「暂无相关资料」, pre-rerank diversify ≤3/material, deixis soft retrieval query. **Further shipped:** LLM query rewrite (`2026-09-17-llm-query-rewrite`) + answer structure/short-title (`answer-inline-citations`). Spec: `docs/superpowers/specs/2026-09-16-ai-accuracy-multi-recall-rerank-design.md`.

**Status:** Tasks 1–4 实现完成；产品 Case 可与笔记阶段并行 spot-check。下一产品重点见 phase3 笔记 Task。

## Global Constraints

- Final prompt chunks: **topK = 8** (config 6–10, hard max 10)
- Insufficient copy: **`暂无相关资料`**
- Bailian floor **0.4**; light fallback does **not** reuse that floor
- Pre-rerank diversify: **≤3 chunks / material_id**
- General (no KB) mode unchanged
- Fixed system rules in `RAG_SYSTEM_RULES` (`ragRetrieve.js`)

---

### Task 1: ragRetrieve helpers + tests

**Files:**
- Create: `supabase/functions/_shared/ragRetrieve.js`
- Create: `supabase/functions/_shared/ragRetrieve.test.js`
- Modify: `supabase/functions/_shared/rag.ts` (re-export `buildRagSystemPrompt`)
- Modify: `supabase/functions/chat-message/core.js` (`RAG_INSUFFICIENT_CONTENT`)

- [x] Implement extractQueryTerms, buildRetrievalQuery / needsRetrievalContext, fuseByRrf, diversifyByMaterial, lightRerank, rerankCandidatesWithFallback, buildRagSystemPrompt, isRetrievalTooWeak, logRagDebug
- [x] Unit tests for RRF, diversify, Bailian/light fallback, prompt rules, insufficient constant
- [x] Run: `node --test supabase/functions/_shared/ragRetrieve.test.js supabase/functions/chat-message/core.test.js`

### Task 2: Keyword match RPC

**Files:**
- Create: `supabase/migrations/202609160004_match_material_chunks_keyword.sql`

- [x] `match_material_chunks_keyword(query_terms text[], match_count, filter_user, filter_kb_ids, filter_tag_ids)` with same auth/KB/tag filters as vector RPC
- [x] Rank by hit count on title+content; return aligned columns + `keyword_rank`

### Task 3: Wire chat-message + Bailian rerank

**Files:**
- Modify: `supabase/functions/chat-message/index.ts`
- Modify: `supabase/functions/_shared/ai.ts` (`rerankDocuments`)

- [x] Load recent user messages for retrieval query + chat history for LLM
- [x] Parallel vector (20) + keyword (20) → RRF → diversify ≤3/doc → Bailian rerank (floor 0.4) → light fallback → top8
- [x] If empty/weak: persist insufficient, **skip LLM**
- [x] Else: build prompt, log debug pipeline (`full_llm_prompt`), call DeepSeek with history, resolveRagAnswerOutcome
- [x] Follow-up retrieval: deixis soft hint only (no full prior-question concat)

### Task 4: Verify + commit

- [x] Run unit tests
- [x] Deploy `chat-message` Edge for staging/manual QA
- [ ] Product Case1–4 manual OK
- [ ] Commit on feature branch (only after functional OK)
