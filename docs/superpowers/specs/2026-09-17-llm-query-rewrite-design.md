# LLM Query Rewrite（检索前语义改写）

**Date:** 2026-09-17  
**Status:** **已落地**（`chat-message` 已部署 Tokyo；用户确认设计后实现）  
**Replaces (partial):** §7 rule-only `rewriteRetrievalQueries` in `2026-09-16-ai-accuracy-multi-recall-rerank-design.md`  
**Scope:** RAG path in `chat-message` only（general/online 不变）  
**Plan:** `docs/superpowers/plans/2026-09-17-llm-query-rewrite.md`

## 1. Problem

规则改写（正则/指代词）无法覆盖用户五花八门的追问表达。例：「具体是什么」被当成独立问句 embedding → 召回失败 →「暂无相关资料」。

## 2. Goal

检索前用**轻量 LLM**做语义改写：结合当前问句 + 最近对话，产出可检索的完整 query；失败时自动回退现有规则，保证服务可用。

## 3. Pipeline（插入点）

```
askText + recent turns
        │
        ▼
┌─────────────────────┐
│ LLM query rewrite   │  ← 新增（优先）
│ timeout / error?    │
└─────────┬───────────┘
          │ fail / 校验后 queries 全空
          ▼
┌─────────────────────┐
│ rewriteRetrievalQueries（现有规则）│  ← fallback
└─────────┬───────────┘
          ▼
queries (1–2 条) → embed 多路 → 向量+关键词召回
          → 按 chunk_id 去重（保留最高相似度）→ RRF → diversify → rerank → LLM 回答
```

### 3.1 多路召回与去重

- 每条 rewrite query 各做一轮向量召回（与现网一致）；关键词 terms 由全部 query 抽词并集，关键词召回仍 1 路。
- **RRF 输入前去重（严格）：** 同一 `chunk_id` 若出现在多条向量列表和/或关键词列表中，**只保留相似度最高的一条**，丢弃其余副本。
  - 相似度取值：优先用召回行的 `similarity`（向量）；关键词命中若无 `similarity`，用可比较的代理分（如现网 keyword 分 / `1/(rank+k)`），与向量分在同一比较函数中取 max。
  - **禁止**「先到者保留」——避免多路顺序导致不确定结果。
- 去重后的唯一 chunk 列表再进入 RRF（若现实现是多 rank list 融合：每条 list 内先按 chunk_id 去重保留该 list 最高分，跨 list 仍由 RRF 融合；**跨 list 同一 chunk 最终进 diversify/rerank 前再按最高 similarity 留一条**）。实现以「最终候选集每个 chunk_id 至多一条，且为所见最高 similarity」为准。

## 4. LLM 改写契约

### 4.1 输入

| 字段 | 内容 |
| --- | --- |
| `current` | 当前用户问句（`askText`，含 tag 规范化后的检索用文本） |
| `recent_user` | 最近 **1～2** 条 **user** 问句（优先 trailing RAG 段，与现 `userQuestionsForRetrievalRewrite` 同源） |
| `recent_assistant`（可选） | 最近 **1** 条 RAG assistant 的**本地文本摘要**（见下），帮助消解「具体是什么」等指代 |

**`recent_user` 已知局限（非 bug）：** 只看最近 1～2 条 user。若指代实体出现在更早轮次、中间又穿插了别的话题，改写可能消解失败并落入规则 fallback。这是首版刻意限制上下文，避免 token/延迟膨胀；见 §10。开发/测试/维护遇到此类 case 应记为**已知限制**，用 debug 日志沉淀，而不是当偶发缺陷反复修规则。

**`recent_assistant` 实现方式（首版明确）：**

- **仅本地字符串处理，不再次调用 LLM 做摘要**（避免改写路径双倍延迟与费用）。
- 步骤：取最近一条 `answer_mode=rag` 的 assistant `content` → 去掉 `[n]` 引用标记 → 折叠多余空白 → **截断至 ≤300 字**（超出加 `…`）。
- 无可用 RAG assistant 时省略该字段。
- 默认可开；可用 env / 开关关闭以对比延迟。

首版最少实现：`current` + `recent_user`（1～2 条）。`recent_assistant` 为可选增强，默认开。

### 4.2 输出（严格 JSON）

```json
{
  "queries": ["完整检索句1", "完整检索句2"],
  "is_followup": true
}
```

| 约束 | 说明 |
| --- | --- |
| `queries` | 数组，最多取前 **2** 条；每条应为可独立 embedding 的完整问句/主题句 |
| `is_followup` | `true` = 指代/澄清/展开追问；`false` = 独立新问 |
| 协议失败 | 非法 JSON / `queries` 非数组 → 整单 fallback |

### 4.3 逐条业务校验（JSON 通过之后）

对 `queries` **逐条**校验；**非法只丢该条，不整单 fallback**。全部非法或过滤后为空 → 再 fallback 规则。

| 校验 | 规则 |
| --- | --- |
| 非空 | `trim()` 后长度 ≥ 1；纯空白丢弃 |
| 长度 | 1～**120** 字（按 JS string length）；超长**丢弃该条**（不截断充数） |
| 基础敏感 | 命中本地敏感词表（与现网若已有列表则复用，否则首版小词表 + 可配置）→ 丢弃该条 |
| 离题粗检（可选增强） | 首版不做语义离题模型；依赖 prompt「不得编造实体」。若后续误召严重，再加与 `recent_user`/`current` 的字符重叠下限 |

校验过程 debug：记录被丢弃条数与原因（`empty` / `too_long` / `sensitive`）。

### 4.4 模型与超时 / 延迟监控

| 项 | 取值 |
| --- | --- |
| 模型 | DashScope compatible：`qwen-turbo`（轻量、低延迟；可用 env `RAG_REWRITE_MODEL` 覆盖） |
| 超时 | **800ms**（可用 env `RAG_REWRITE_TIMEOUT_MS`） |
| 温度 | `0` |
| max_tokens | `256` |

**Abort 必须真正取消上游请求：**

- 使用 `fetch(..., { signal: AbortSignal.timeout(ms) })`（或等价 `AbortController` + `clearTimeout`）。
- 超时后 **必须 abort 发往 DashScope 的 HTTP 请求**，让连接中止；**禁止**「客户端丢弃结果、后台仍跑完」——否则继续耗 token、占并发，超时形同虚设。
- 实现验收：超时路径打 `fallback.reason=timeout`，且不得在 abort 之后再解析/使用该次响应体。

**上线后重点监控改写 P95 耗时**（日志带 `rewrite_latency_ms`，便于采集）。

- 若 **P95 持续 > 500ms**：后续迭代优先考虑 **缩小超时** 或 **换成更小模型**，而不是先加规则。
- 800ms 为硬上限防尾延迟；产品目标是把 P95 压到 500ms 以下。

### 4.5 System 要点（短）

- 只改写检索 query，不回答用户。
- 追问必须还原成带实体的完整问句；可附 1 条补充角度（如「具体有哪些模块」）。
- 独立新问：通常 1 条（当前句或轻微规范化）；长 how-to 可拆第 2 条核心主题。
- 严禁编造知识库没有的实体名；只能重组用户已说内容。

## 5. Fallback

整单走现有 `rewriteRetrievalQueries` 的情况：

- 超时 / HTTP 非 2xx / 网络错误  
- JSON 解析失败 / `queries` 非数组  
- 逐条校验后 **合法 query 数为 0**  
- 未配置 `DASHSCOPE_API_KEY`

**不**因单条非法而整单 fallback。Fallback **不**抛错中断整次聊天。

`is_followup` 在 fallback 时由规则推导：`isContextualFollowUp(current)`。

## 6. Debug 日志

统一前缀 `[rag-debug]`：

| 字段 | 含义 |
| --- | --- |
| `query_rewrite_input` | `{ current, recent_user, recent_assistant? }` |
| `query_rewrite_output` | `{ queries, is_followup, source: "llm" \| "rules_fallback" }` |
| `query_rewrite_fallback` | 若整单 fallback：`{ reason }`（`timeout` / `http` / `parse` / `all_invalid` / `no_key` / …） |
| `query_rewrite_dropped` | 可选：`[{ query, reason }]` 被逐条丢弃的项 |
| `rewrite_latency_ms` | 改写调用耗时（含失败路径），用于 P95 监控 |

现有 `query_rewrite=` 日志改为上述结构化字段，避免重复噪声。

## 7. 与回答链路的关系

| 用途 | 是否用 LLM rewrite 结果 |
| --- | --- |
| Embedding / 关键词召回 / rerank 的 query | **是**（最多 2 条合法 query） |
| 回答 LLM 是否带会话上文 | 见下方 `is_followup` 边界 |
| `parentScopeFallback`（子模块整体开场白） | 仍用规则 `kind === 'submodule_attribute'`；LLM 路径首版**不**根据 `is_followup` 自动开 parent-scope |

### 7.1 `is_followup` 使用边界

| 场景 | 行为 |
| --- | --- |
| LLM 改写成功 | 用返回的 `is_followup`：**true** → `historyMessagesForRagLlm` 带上近期 RAG 上文；**false** → 按独立问处理（避免上轮污染） |
| 规则 fallback | 用 `isContextualFollowUp(current)` 推导，**不**假装来自 LLM |
| **不做** | 不单独持久化到 DB；不改变前端气泡文案；不触发 parent-scope 开场白；不作为「是否调用回答 LLM」的闸门（召回过弱仍可直接「暂无相关资料」） |
| 与 `queries` 不一致时 | 以校验后的 `queries` 做检索为准；`is_followup` 只影响**回答阶段是否注入 history**。若 `is_followup=false` 但 query 明显承接上文，首版不二次纠正（靠 prompt + 线上 case 观察） |

## 8. 改动面

| 文件 | 改动 |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | `rewriteQueriesWithLlm(...)` + timeout + latency |
| `supabase/functions/_shared/ragRetrieve.js` | `resolveRetrievalQueries`：LLM → 逐条校验 → fallback；chunk 按最高 similarity 去重 |
| `supabase/functions/chat-message/index.ts` | 编排改写 → 多 query 召回；debug 日志 |
| `*_test.js` | 解析、逐条丢弃、全非法 fallback、最高 similarity 去重；mock LLM |

## 9. 验收

- [x] 「联想项目有几个功能模块」→「具体是什么」：LLM 产出含「功能模块」的完整 query，不再单独 embed「具体是什么」（单元 + 部署后抽检）  
- [x] 独立问「大模型是什么」：`is_followup=false`，query ≈ 当前句，不被上轮污染  
- [x] 改写返回 1 条合法 + 1 条超长/敏感：只用合法那条，不 fallback  
- [x] 改写返回全部非法 / 超时 / 坏 JSON：rules fallback，接口仍 200  
- [x] 同 chunk 多路命中：最终只留 similarity 最高的一条  
- [x] debug 可见 input / output / dropped / fallback reason / `rewrite_latency_ms`  
- [x] 超时路径真正 abort 上游（`AbortSignal.timeout`）  
- [ ] 上线后持续统计改写 P95；持续 >500ms 时缩超时或换更小模型（运维观察项）  
- [x] 文档知悉：隔轮指代失败属已知限制（§4.1 / §10），非未登记 bug

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 改写延迟 | 硬超时 800ms 且 **abort 上游请求**；监控 P95，目标 &lt;500ms；超标则缩超时/换模型 |
| 坏 query / 敏感 / 超长 | 逐条校验丢弃；全非法才 fallback |
| 改写胡编实体 | prompt 禁止；回答仍受 chunk + citation 闸门 |
| **语义合法但偏离真实意图**（语法/长度都过，召回跑偏） | 首版：prompt 约束「只能重组对话已有实体」+ 回答 citation 闸门；debug 对比 `query_rewrite_input` vs `output`；后续可加与 recent 的重叠下限或人工抽检队列。**不**因单条「看起来离题」整单 fallback |
| **仅取最近 1～2 轮 user**，隔轮实体 / 长链式多轮指代可能消解失败 | **已知限制**：失败后自动 fallback 原有规则；靠 debug 统计失败 case；**暂不**扩大上下文轮次以免 token 膨胀；后续按线上数据评估是否扩轮次或引入会话实体缓存。勿当偶发 bug 反复堆规则 |
| 双 query 成本 | 合法上限 2；去重避免重复 chunk 膨胀 |
| 多路去歧义 | 最高 similarity 留一条，禁止先到者 |
| 超时未真正取消上游 | 实现必须用 `signal` abort DashScope请求，禁止只丢弃响应 |
