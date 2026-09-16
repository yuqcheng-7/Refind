# AI 准确度：多路召回 + 轻量 Rerank + 多轮上下文（A′）设计

> 日期：2026-09-16  
> 状态：**待实现**（设计已口头确认第一节–第三节）  
> 分支：`phase-ai-accuracy-platform-parse`  
> 前置：严格 RAG 已落地（`chat-message` + `match_material_chunks`）；视频 ASR/真字幕属后续 C 切片  
> 关联：`docs/superpowers/specs/2026-09-15-rag-chat-foundation-design.md`、`docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`（V1.5 混合检索/rerank）

## 1. 目标

改善「库里有相关资料，却答偏或资料不足」（用户反馈 A 类为主；C 类视频解析另开切片）：

1. **多路召回**：向量相似 + 关键词/标题匹配，再融合  
2. **轻量 rerank**：对候选二次排序，最终约 **5** 条进 prompt  
3. **多轮上下文**：跟进问题带着近期对话做检索与生成  
4. **不足判定保留并略收紧**：检索仍空/过弱 → 明确「资料不足」，不硬编

成功标准：

- 同一批资料下，相关问法命中率明显高于现状单路 top-8 + floor 0.2  
- 跟进问（含指代）不再完全丢上文  
- 无关问题仍能稳定落到「资料不足」，而不是乱引用  
- 不引入重型外部 rerank 服务；延迟可接受

## 2. 非目标

- 视频 ASR / 真字幕 / 帧 OCR（C 切片）  
- 联网搜索真实实现  
- 笔记 / 灵感卡片闭环  
- Cross-encoder 云端 rerank、独立检索微服务  
- 改写用户可见的「资料不足」文案产品调性（可沿用现有句，除非实现时发现必须区分原因）

## 3. 现状基线（问题）

| 项 | 现状 |
| --- | --- |
| 召回 | 仅 `match_material_chunks` 单路向量；`match_count=8`；`SOFT_SIMILARITY_FLOOR=0.2` |
| Rerank | 无（计划写在 V1.5） |
| 多轮 | 会话已持久化，但 LLM/检索只用当前一句 |
| 严格性 | 有有效 `[n]` 即视为充足；无句级 groundedness |

## 4. 目标架构

```
用户发消息（可含 conversationId）
  → chat-message
  → 拼检索查询：当前问题 + 最近 1–2 条用户问（可选拼接）
  → 并行：
       向量路 match_material_chunks（拉宽 ~20）
       关键词/标题路 match_material_chunks_keyword（~20）
  → RRF 融合去重
  → 轻量 rerank → topK ≈ 5（可配 4–6）
  → 不足闸门（空 / 过弱）→ 固定不足文案
  → buildRagSystemPrompt(编号片段) + 近期对话窗口 + 当前用户消息
  → DeepSeek → 引用 sanitize（无有效 [n] → 不足）
  → 持久化 messages + citations
```

General 模式（无 KB/标签）不变：不走多路召回。

## 5. 多路召回与融合

### 5.1 共同过滤

与现 RPC 一致：`user_id`、`materials.status = ready`、KB 并集、标签 AND、`auth` 绑定。

- 向量路：`embedding is not null`  
- 关键词路：要求 `content` 非空；**允许** embedding 暂缺的块进入候选（减少「有正文未 embed」漏召），但 rerank 进最终 top5 时优先已 embedding；若仅有未 embed 块且正文可用，仍可进 prompt（避免空答）

### 5.2 向量路

- 复用 `match_material_chunks`  
- `match_count` 召回阶段提高到约 **20**（上限仍受 RPC 50 约束）

### 5.3 关键词 / 标题路

- 新增 RPC（名示例）：`match_material_chunks_keyword`  
- 匹配对象：`materials.title` + `material_chunks.content`  
- 实现优先序：  
  1. Postgres `to_tsvector` / `plainto_tsquery`（simple 或中文可用配置；若中文分词不足则辅以）  
  2. 对查询抽词后的 `ILIKE %term%` 多词 OR/AND 降级策略  
- 从问题抽词：去停用词、保留中英数字 token；过短 query 可整句匹配 title  
- `match_count` ≈ **20**  
- 返回字段与向量路对齐，另带 `keyword_rank`（或 ts_rank）供融合/rerank

### 5.4 融合

- **RRF**：`score = Σ 1 / (k_rrf + rank_i)`，建议 `k_rrf = 60`  
- 按 `chunk_id` 去重  
- 输出有序列表作为 rerank 输入

### 5.5 召回侧不足

- 两路皆空 → 不足  
- 融合后无可用正文 → 不足  

## 6. 轻量 Rerank

在 Edge `chat-message`（或 `_shared/rag.ts`）内同步计算，无外部调用：

| 信号 | 作用 |
| --- | --- |
| 向量 similarity | 有则用；缺失则 0 |
| 标题命中 | 查询词是否出现在 `material_title` |
| 正文 overlap | token Jaccard 或归一化命中数 |
| 关键词路 ts_rank | 有则并入 |

加权和排序后取 **topK = 5**（配置允许 **4–6**）。

**多样性**：同一 `material_id` 建议最多 **2–3** 条，避免单篇占满。

**过弱门槛（rerank 后）**：最高分过低且无标题强命中、无关键词强命中时 → 不足（具体阈值实现计划用测试钉死；相对现状 0.2 应收紧向量硬门槛或改为「相对 top1 的比例 + 绝对下限」组合）。

## 7. 多轮上下文

| 用途 | 策略 |
| --- | --- |
| 检索查询 | `当前问题` + 最近 **1–2** 条同会话用户消息文本（截断总长） |
| 生成消息列表 | 最近约 **3** 轮 user/assistant（约 6 条）+ 当前 user；system 仍为 RAG 系统提示 |

约束：

- 事实只能来自资料片段；上文仅用于理解指代与任务延续  
- 遵守已有 surface / KB 会话隔离  

## 8. Prompt 与引用

- 延续严格 RAG：主张须带 `[n]`；不得编造片段外事实  
- 明示可参考对话上文理解指代  
- `resolveRagAnswerOutcome`：无有效 in-range `[n]` → 不足（保留）  
- 本切片不做句级 entailment  

## 9. 主要改动面

| 区域 | 改动 |
| --- | --- |
| `supabase/migrations/` | 新关键词匹配 RPC；必要时 title/content 的 tsvector 生成列或表达式索引 |
| `supabase/functions/_shared/rag.ts` | RRF、rerank、检索查询拼装、prompt 微调 |
| `supabase/functions/chat-message/` | 并行召回、历史窗口加载、topK=5、不足闸门 |
| `chat-message/core.js` + tests | floor/topK/融合纯函数单测 |
| 前端 | 原则上不改；若需展示「参考了 N 条」可随后续 |

## 10. 验收清单

- [ ] 向量 + 关键词并行召回并 RRF 融合  
- [ ] Rerank 后稳定约 5 条进 prompt；同资料条数受限  
- [ ] 跟进问（指代）检索/生成使用上文  
- [ ] 空库 / 无关问 → 资料不足  
- [ ] 相关问命中优于基线（至少用固定 fixture 单测 + 1–2 条手工样例）  
- [ ] General 模式行为不变  
- [ ] 无新外部 API Key 依赖  

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 中文 FTS 分词弱 | ILIKE/抽词降级；后续可换 zhparser |
| 延迟上升 | 两路并行；rerank O(n) 本地；限制候选 ≤40 |
| 关键词噪声 | RRF + rerank + 最终 k=5 + 过弱门槛 |
| 未 embed 块 | 可召回但优先已 embed；监控 embed 失败 |

## 12. 后续切片（不在本文）

- C：Douyin / Bilibili / XHS **真字幕或 ASR** 入库  
- 更强 rerank（cross-encoder）若轻量方案不够  
- 托管 platform-parser，避免仅本地 8787  
