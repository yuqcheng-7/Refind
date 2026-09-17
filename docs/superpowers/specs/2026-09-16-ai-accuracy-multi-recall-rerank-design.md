# AI 准确度：多路召回 + Rerank + 多轮上下文（A′）设计

> 日期：2026-09-16  
> 最近修订：2026-09-17（as-built + LLM query rewrite）  
> 状态：**已落地**（Edge `chat-message` + `ragRetrieve.js` + 关键词 RPC + LLM 检索改写；回答结构见引用设计）  
> 分支：`phase-ai-accuracy-platform-parse`  
> 前置：严格 RAG 已落地（`chat-message` + `match_material_chunks`）；视频 ASR/真字幕属后续 C 切片  
> 关联：`docs/superpowers/specs/2026-09-15-rag-chat-foundation-design.md`、`docs/superpowers/plans/2026-09-16-ai-accuracy-multi-recall-rerank.md`  
> **检索改写升级：** `docs/superpowers/specs/2026-09-17-llm-query-rewrite-design.md`（规则改写降为 fallback）  
> **回答结构：** `docs/superpowers/specs/2026-09-15-answer-inline-citations-design.md`

## 1. 目标

改善「库里有相关资料，却答偏或资料不足」（用户反馈 A 类为主；C 类视频解析另开切片）：

1. **多路召回**：向量相似 + 关键词/标题匹配，再 RRF 融合  
2. **Rerank**：优先百炼 `qwen3-rerank`；失败则本地 light rerank；最终约 **8** 条进 prompt（运维带 6–10，上限 10）  
3. **多轮上下文**：跟进问题带指代时软拼接检索提示；生成侧带近期对话窗口  
4. **不足判定**：召回空 / rerank 过弱 → **不调用 LLM**，直接返回固定文案「暂无相关资料」

成功标准：

- 同一批资料下，相关问法命中率明显高于单路 top-8 + 过低 similarity floor  
- 跟进问（含指代）能理解上文，且不因整句拼接上文而污染检索  
- 无关问题稳定落到「暂无相关资料」，不乱引用  
- 延迟可接受；百炼 rerank 不可用时自动降级本地 light rerank

## 2. 非目标

- 视频 ASR / 真字幕 / 帧 OCR（C 切片）  
- 联网搜索真实实现  
- 笔记 / 灵感卡片闭环  
- 独立检索微服务  
- Cross-encoder 以外的重型专用 rerank 集群（本切片已用百炼兼容 rerank API）

## 3. 现状基线 → As-built

| 项 | 落地前 | As-built（2026-09-17） |
| --- | --- | --- |
| 召回 | 仅向量 `match_material_chunks` | 向量 20 + 关键词 `match_material_chunks_keyword` 20，并行 |
| 融合 | 无 | RRF（`k=60`），候选上限 40 |
| 多样性 | 无 | RRF 后按 `material_id` 最多 **3** 条再进 rerank；最终 topN 再限每资料 ≤3 |
| Rerank | 无 | 百炼 `qwen3-rerank`（`DASHSCOPE_API_KEY`）+ light 兜底 |
| 进 prompt | top≈8、floor 0.2 | 默认 **topK=8**（6–10）；Bailian 分 **floor 0.4**；light 兜底**不**套 0.4 |
| 多轮检索 | 仅当前句 | **LLM query rewrite**（失败则规则指代软拼）；独立问只用当前句 |
| 多轮生成 | 仅当前句 | 最近约 6 条消息 + 当前 user（受 `is_followup`） |
| 不足文案 | 较长说明型 | 固定 **`暂无相关资料`**；弱检索短路不调 LLM |
| 引用 | `[n]` | 句末 `[n]`；禁止文档名与末尾汇总列表；多文档冲突分别标注 |

## 4. 目标架构（as-built）

```
用户发消息（可含 conversationId）
  → chat-message
  → 检索 query：resolveRetrievalQueries
       优先 LLM 语义改写（qwen-turbo，≤800ms abort）
       失败/全非法 → rewriteRetrievalQueries（规则 fallback）
  → 每条 query 向量召回；关键词 terms 并集 1 路
  → 同 chunk_id 保留最高 similarity → RRF 融合（≤40）
  → diversifyByMaterial（每资料 ≤3）
  → Bailian qwen3-rerank（floor 0.4）→ 失败则 lightRerank
  → 取 topK≈8（运维 6–10）
  → 不足闸门（空 / 过弱）→ 固定「暂无相关资料」（跳过 LLM）
  → buildRagSystemPrompt(编号片段) + 近期对话窗口（受 is_followup 控制）
  → DeepSeek → resolveRagAnswerOutcome / sanitizeRagAnswer（无有效 [n] → 不足）
  → 持久化 messages + citations
  → rag-debug 全链路日志（含 query_rewrite_*、full_llm_prompt）
```

General 模式（无 KB/标签）不变：不走多路召回与 LLM query rewrite。

## 5. 多路召回与融合

### 5.1 共同过滤

与现 RPC 一致：`user_id`、`materials.status = ready`、KB 并集、标签 AND、`auth` 绑定。

### 5.2 向量路

- 复用 `match_material_chunks`  
- `match_count` ≈ **20**

### 5.3 关键词 / 标题路

- RPC：`match_material_chunks_keyword`（迁移 `202609160004_match_material_chunks_keyword.sql`）  
- 匹配：`materials.title` + `material_chunks.content`  
- 抽词：中英数字 token、停用词过滤、长中文另发 2-gram  
- `match_count` ≈ **20**；返回 `keyword_rank`

### 5.4 融合与多样性

- **RRF**：`score = Σ 1 / (60 + rank_i)`  
- **最高 similarity 去重（严格）：** 同一 `chunk_id` 跨多路只保留可比分最高的一条，**禁止**先到者保留  
- **diversify**：进 rerank 前同一 `material_id` 最多 **3** 条（顺序保留）

## 6. Rerank

| 路径 | 行为 |
| --- | --- |
| 主路径 | `rerankDocuments` → DashScope compatible `/reranks`，模型 `qwen3-rerank` |
| 分数门槛 | Bailian 结果先滤 `relevance_score < 0.4`，再取 topK |
| 兜底 | API 失败 / 滤后为空 → `lightRerank`（similarity + 标题命中 + overlap + keyword_rank）；**不**再套 0.4 floor，直接按 light 分取 topK |
| 最终条数 | `RAG_FINAL_TOP_K = 8`（可配 6–10，硬顶 10） |

## 7. 多轮与 Query Rewrite

| 用途 | 策略（as-built 2026-09-17） |
| --- | --- |
| Query Rewrite（主路径） | `resolveRetrievalQueries` → **LLM 语义改写**（`qwen-turbo`，超时 800ms 真 abort）产出 1–2 条完整检索句；逐条校验（非空、≤120、敏感）；失败/全非法 → **规则** `rewriteRetrievalQueries` fallback |
| `is_followup` | LLM 成功时用返回值控制 `historyMessagesForRagLlm`；fallback 时用 `isContextualFollowUp` |
| 生成消息列表 | 最近约 **6** 条 user/assistant + 当前 user；system 为升级后的回答规则 + 编号片段 |
| parent-scope 开场白 | 仍仅规则 `kind === 'submodule_attribute'`；LLM 路径首版不自动开 |

详细契约见 `2026-09-17-llm-query-rewrite-design.md`。

回答 System Prompt 优先级（as-built）：

1. 优先用检索 chunk 原文，句末 `[n]`  
2. 结构：大标题「一、二、三、」→ 小分点「1. 2. 3. 4.」或「· 」；短标题仅 2～12 字 `**短标题：**`（详见回答可读性设计）  
3. 无子项单独信息但有所属整体信息 → 可用整体信息，**开头必须**：「知识库中没有该模块单独对应的技术描述，以下是产品整体相关技术信息。」  
4. 完全没有相关信息 →「暂无相关资料」  
5. 严禁编造

## 8. Prompt 与引用

固定规则见 `RAG_SYSTEM_RULES_BASE`（+ 条件注入 `RAG_SYSTEM_RULES_PARENT_SCOPE`）：优先 chunk 原文 + `[n]`；结构与短标题约束；子项缺失可用整体信息但须固定开场白；完全无相关才「暂无相关资料」；严禁编造。

不足文案统一：`暂无相关资料`。

- `resolveRagAnswerOutcome`：无有效 in-range `[n]` → 不足；并经 `sanitizeRagAnswer` 清洗结构/残星  
- **兜底**：召回/rerank 判定不足时 **不调用 LLM**

## 8.1 全链路调试日志

`[rag-debug]` 打印：`query_rewrite_input/output/fallback/dropped`、`rewrite_latency_ms`、两路结果、RRF、diversify、rerank provider、reranked/top、`full_llm_prompt`、LLM 原始输出。

## 8.2 手工验收 Case

- **Case1**：库内有答案 → 回答含正确 `[n]`，不编造  
- **Case2**：库内无相关 → 稳定「暂无相关资料」  
- **Case3**：指代跟进（如「那它怎么做」「具体是什么」）→ LLM 改写为带实体完整 query，检索不被裸追问污染  
- **Case4**：单篇多 chunk → 最终进 prompt 同资料不超过 3 条  
- **Case5**：并列模块列表 → 界面显示递增 `1. 2. 3. 4.`（非全为 1.）；短标题 2～12 字加粗

## 9. 主要改动面

| 区域 | 改动 |
| --- | --- |
| `supabase/migrations/202609160004_…` | `match_material_chunks_keyword` |
| `supabase/functions/_shared/ragRetrieve.js` (+tests) | RRF、最高 similarity 去重、diversify、light/Bailian、prompt、闸门、`resolveRetrievalQueries`、debug |
| `supabase/functions/_shared/ai.ts` | `rerankDocuments`（qwen3-rerank）；`rewriteQueriesWithLlm` |
| `supabase/functions/chat-message/` | 编排改写 → 并行召回 → rerank → 可选 DeepSeek |
| 前端 | `formatAnswerText` / `AnswerContent`：结构修复、短标题、引用浮卡 portal |

## 10. 验收清单

- [x] 向量 + 关键词并行召回并 RRF 融合  
- [x] Bailian rerank + light 兜底；默认约 8 条进 prompt；同资料 ≤3  
- [x] LLM query rewrite + 规则 fallback；最高 similarity 去重  
- [x] 跟进问检索语义改写；生成带上文（受 `is_followup`）  
- [x] 空库 / 过弱 →「暂无相关资料」且可跳过 LLM  
- [x] 单元测试：`ragRetrieve.test.js`、`chat-message/core.test.js`、前端 format/AnswerContent  
- [ ] 产品侧固定资料手工 Case1–5（可与笔记阶段并行 spot-check）  
- [x] General 模式行为不变  

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 中文 FTS/抽词弱 | 2-gram + ILIKE 命中；监控漏召后再调 topK |
| Bailian 延迟/失败 | 并行召回；失败自动 light；日志 `bailian_rerank_failed` |
| 跟进污染 / 裸追问 | LLM 改写 + 禁止整句拼接；规则 fallback |
| 改写延迟 | 800ms abort；监控 P95 目标 &lt;500ms |
| 单篇占满 | diversify ≤3 / 资料 |
| 模型全写「1.」 | 前端 `rewriteParallelSectionTitles` + prompt 约束 |

## 12. 后续切片（不在本文）

- **下一阶段（产品确认）：** 笔记模块智能化（灵感收藏落库、整理生成、引用回链、同步知识库）→ 再托管上线  
- C：Douyin / Bilibili / XHS **真字幕或 ASR** 入库  
- 托管 platform-parser  
- 运维按 Case 调 topK（6↔10）与 floor；改写 P95 监控