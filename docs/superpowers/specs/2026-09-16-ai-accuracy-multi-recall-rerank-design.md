# AI 准确度：多路召回 + Rerank + 多轮上下文（A′）设计

> 日期：2026-09-16  
> 最近修订：2026-09-17（as-built）  
> 状态：**已落地**（Edge `chat-message` + `ragRetrieve.js` + 关键词 RPC；待产品端到端验收后正式 commit）  
> 分支：`phase-ai-accuracy-platform-parse`  
> 前置：严格 RAG 已落地（`chat-message` + `match_material_chunks`）；视频 ASR/真字幕属后续 C 切片  
> 关联：`docs/superpowers/specs/2026-09-15-rag-chat-foundation-design.md`、`docs/superpowers/plans/2026-09-16-ai-accuracy-multi-recall-rerank.md`

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
| 多轮检索 | 仅当前句 | 独立问只用当前句；短句/指代才软拼上一轮用户问的关键词 |
| 多轮生成 | 仅当前句 | 最近约 6 条消息 + 当前 user |
| 不足文案 | 较长说明型 | 固定 **`暂无相关资料`**；弱检索短路不调 LLM |
| 引用 | `[n]` | 句末 `[n]`；禁止文档名与末尾汇总列表；多文档冲突分别标注 |

## 4. 目标架构（as-built）

```
用户发消息（可含 conversationId）
  → chat-message
  → 拼检索查询：buildRetrievalQuery（独立问 / 指代软提示）
  → 并行：
       向量路 match_material_chunks（~20）
       关键词路 match_material_chunks_keyword（~20）
  → RRF 融合去重（≤40）
  → diversifyByMaterial（每资料 ≤3）
  → Bailian qwen3-rerank（floor 0.4）→ 失败则 lightRerank
  → 取 topK≈8（运维 6–10）
  → 不足闸门（空 / 过弱）→ 固定「暂无相关资料」（跳过 LLM）
  → buildRagSystemPrompt(编号片段) + 近期对话窗口 + 当前用户消息
  → DeepSeek → resolveRagAnswerOutcome（无有效 [n] → 不足）
  → 持久化 messages + citations
  → rag-debug 全链路日志（含 full_llm_prompt）
```

General 模式（无 KB/标签）不变：不走多路召回。

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

- **RRF**：`score = Σ 1 / (60 + rank_i)`，按 `chunk_id` 去重  
- **diversify**：进 rerank 前同一 `material_id` 最多 **3** 条（顺序保留）

## 6. Rerank

| 路径 | 行为 |
| --- | --- |
| 主路径 | `rerankDocuments` → DashScope compatible `/reranks`，模型 `qwen3-rerank` |
| 分数门槛 | Bailian 结果先滤 `relevance_score < 0.4`，再取 topK |
| 兜底 | API 失败 / 滤后为空 → `lightRerank`（similarity + 标题命中 + overlap + keyword_rank）；**不**再套 0.4 floor，直接按 light 分取 topK |
| 最终条数 | `RAG_FINAL_TOP_K = 8`（可配 6–10，硬顶 10） |

## 7. 多轮上下文

| 用途 | 策略 |
| --- | --- |
| 检索查询 | 默认可独立成问：**只用当前句**。短句（≤10）或指代词（它/这个/那/上述…）→ 取上一轮用户问的关键词作软提示，**禁止**整句拼接多轮用户问（避免主题污染） |
| 生成消息列表 | 最近约 **6** 条 user/assistant + 当前 user；system 为 RAG 固定规则 + 编号片段 |

## 8. Prompt 与引用

固定规则要点（`RAG_SYSTEM_RULES`）：

1. 只能用【资料片段】，禁止预训练知识  
2. 句末标注 `[1][2]…`；不要写文档名、不要末尾汇总参考列表  
3. 无相关信息 → 直接回复「暂无相关资料」  
4. 多文档冲突时分别标注来源观点，不擅自合并  

不足文案统一：`暂无相关资料`。

- `resolveRagAnswerOutcome`：无有效 in-range `[n]` → 不足  
- **兜底**：召回/rerank 判定不足时 **不调用 LLM**

## 8.1 全链路调试日志

`[rag-debug]` 打印：检索查询、两路结果、RRF、diversify、rerank provider、reranked/top、`full_llm_prompt`、LLM 原始输出。

## 8.2 手工验收 Case

- **Case1**：库内有答案 → 回答含正确 `[n]`，不编造  
- **Case2**：库内无相关 → 稳定「暂无相关资料」  
- **Case3**：指代跟进（如「那它怎么做」）→ 检索不被上一整题污染，仍能命中正确篇  
- **Case4**：单篇多 chunk → 最终进 prompt 同资料不超过 3 条

## 9. 主要改动面

| 区域 | 改动 |
| --- | --- |
| `supabase/migrations/202609160004_…` | `match_material_chunks_keyword` |
| `supabase/functions/_shared/ragRetrieve.js` (+tests) | RRF、diversify、light/Bailian fallback、prompt、闸门、debug |
| `supabase/functions/_shared/ai.ts` | `rerankDocuments`（qwen3-rerank） |
| `supabase/functions/chat-message/` | 编排并行召回 → rerank → 可选 DeepSeek |
| 前端 | 引用浮卡 portal/z-index（避免被 composer 挡住）；不足文案随接口 |

## 10. 验收清单

- [x] 向量 + 关键词并行召回并 RRF 融合  
- [x] Bailian rerank + light 兜底；默认约 8 条进 prompt；同资料 ≤3  
- [x] 跟进问检索用指代软提示；生成带上文  
- [x] 空库 / 过弱 →「暂无相关资料」且可跳过 LLM  
- [x] 单元测试：`ragRetrieve.test.js`、`chat-message/core.test.js`  
- [ ] 产品侧固定资料手工 Case1–4（验收后 commit）  
- [x] General 模式行为不变  

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 中文 FTS/抽词弱 | 2-gram + ILIKE 命中；监控漏召后再调 topK |
| Bailian 延迟/失败 | 并行召回；失败自动 light；日志 `bailian_rerank_failed` |
| 跟进污染 | 禁止整句拼接；仅指代短提示 |
| 单篇占满 | diversify ≤3 / 资料 |

## 12. 后续切片（不在本文）

- C：Douyin / Bilibili / XHS **真字幕或 ASR** 入库  
- 托管 platform-parser  
- 运维按 Case 调 topK（6↔10）与 floor  
