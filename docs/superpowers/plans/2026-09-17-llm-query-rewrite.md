# LLM Query Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RAG 检索前用轻量 LLM 语义改写产出 1–2 条 query；失败或全非法时 fallback 现有规则；多路召回按最高 similarity 去重。

**Architecture:** `resolveRetrievalQueries` 编排 LLM→逐条校验→规则 fallback；`rewriteQueriesWithLlm`（DashScope + AbortSignal 真取消）；`chat-message` 用改写结果 embed/召回，并用 `is_followup` 控制回答 history。

**Tech Stack:** Supabase Edge (`chat-message`), DashScope compatible chat (`qwen-turbo`), existing `ragRetrieve.js` / `ai.ts`.

## Global Constraints

- 超时默认 800ms，必须 abort 上游请求（非仅丢弃响应）
- queries 最多 2 条；逐条校验（非空、≤120、敏感）；单条非法丢弃，全非法才 fallback
- `recent_user` 仅 1–2 条；`recent_assistant` 仅本地截断摘要（≤300），不再调 LLM
- debug：`query_rewrite_input/output/fallback/dropped` + `rewrite_latency_ms`
- 同 `chunk_id` 保留最高 similarity，禁止先到者

---

## File map

| File | Responsibility |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | `rewriteQueriesWithLlm` + timeout abort |
| `supabase/functions/_shared/ragRetrieve.js` | validate queries, assistant snippet, `resolveRetrievalQueries`, similarity dedupe in fuse |
| `supabase/functions/chat-message/index.ts` | wire resolve + history `is_followup` + debug logs |
| `ragRetrieve.test.js` / `ai` tests if any | unit coverage |

---

### Task 1: Query validation + assistant snippet + resolveRetrievalQueries (TDD)

**Files:** `ragRetrieve.js`, `ragRetrieve.test.js`

- [x] Add failing tests: validate drops empty/too_long/sensitive; keeps sibling; all invalid → fallback path; `summarizeAssistantForRewrite` strips `[n]` and truncates 300; `resolveRetrievalQueries` with mock llm success/fail
- [x] Implement `REWRITE_QUERY_MAX_LEN=120`, small sensitive list, `validateRewriteQueries`, `summarizeAssistantForRewrite`, `resolveRetrievalQueries({ current, recentUser, recentAssistant, rewriteFn })`
- [x] Run `node --test _shared/ragRetrieve.test.js`

### Task 2: Highest-similarity chunk merge

**Files:** `ragRetrieve.js`, `ragRetrieve.test.js`

- [x] Test: `fuseByRrf` / helper keeps max `similarity` when same `chunk_id` appears in multiple lists (not first/last wins)
- [x] Implement `chunkComparableScore` + merge with `Math.max` on similarity
- [x] Run tests

### Task 3: `rewriteQueriesWithLlm` in ai.ts

**Files:** `ai.ts` (+ thin test via resolve mock if Deno-hard; or export parse helpers tested in ragRetrieve)

- [x] Implement fetch to DashScope chat completions with `signal: AbortSignal.timeout(timeoutMs)`, model from `RAG_REWRITE_MODEL` default `qwen-turbo`, temperature 0, max_tokens 256
- [x] Return raw content string; throw on abort/http/empty (caller maps to fallback reasons)
- [x] Confirm abort uses fetch signal (no fire-and-forget)

### Task 4: Wire chat-message

**Files:** `chat-message/index.ts`

- [x] Build rewrite input: `askText`, `recentUserQuestions.slice(-2)`, optional assistant snippet from history
- [x] Call `resolveRetrievalQueries` with `rewriteQueriesWithLlm`
- [x] Log structured debug fields; use `queries` for embed/recall
- [x] Pass `is_followup` into `historyMessagesForRagLlm` (extend signature or wrap): LLM success → follow flag; fallback → existing `isContextualFollowUp`
- [x] Keep `parentScopeFallback` on rules `kind === 'submodule_attribute'` only when source is rules

### Task 5: history helper for is_followup override

**Files:** `ragRetrieve.js`, tests, `index.ts`

- [x] Add `historyMessagesForRagLlm(messages, current, { forceFollowUp })` — when `forceFollowUp===true/false` override contextual check; `undefined` → existing behavior
- [x] Tests for override

### Task 6: Deploy + smoke

- [x] `npx supabase functions deploy chat-message --project-ref ngrerfmwxsdothniuorb`
- [x] 单元与核心路径验证通过；产品侧追问抽检可在下一阶段笔记开发前继续 spot-check

## Execution handoff

**本计划已完成（2026-09-17）。** 下一阶段：基于已调好的 AI 回答做**笔记模块智能化**（灵感收藏落库 → 整理生成 → 引用回链 → 同步知识库），再托管上线。见 `2026-09-13-phase3-ai-rag-launch.md` Task 3–7 与路线图 §4。
