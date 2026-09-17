# 严格 RAG 对话基础（阶段三 · 第一片）设计

> 日期：2026-09-15  
> 最近修订：2026-09-17  
> 状态：**已落地**（基础 RAG）；准确度增强见 A′；检索改写见 LLM rewrite；回答结构见引用设计  
> 前置：阶段二后端基础（资料解析、`material_chunks`、会话表）已落地  
> 关联计划：`docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`（本切片对应 Task 1–2）  
> 后续准确度：`docs/superpowers/specs/2026-09-16-ai-accuracy-multi-recall-rerank-design.md`（多路召回 + Bailian/light rerank + 多轮）  
> 检索改写：`docs/superpowers/specs/2026-09-17-llm-query-rewrite-design.md`（已落地）  
> 回答可读性：`docs/superpowers/specs/2026-09-15-answer-inline-citations-design.md`（结构层级 + 短标题已确认）  
> 联网真实搜索：`docs/superpowers/specs/2026-09-17-home-online-qwen-search-design.md`（已落地，替代本切片「联网占位」）
> 用户确认：2026-09-15「可以」

## 1. 目标

把首页 / 知识库「问 AI」从演示假回答，升级为：

1. 资料 `ready` 后自动切片向量化（阿里云百炼 `text-embedding-v4`）。
2. 有知识库或标签范围时：**严格 RAG**——只依据检索到的用户资料回答，并返回**真实引用**。
3. 无范围时：**通用 DeepSeek 对话**——不展示知识库引用 UI。
4. 模型芯片生效：`DS快速` → `deepseek-chat`；`DS深度` → `deepseek-reasoner`（同一把 DeepSeek Key）。

成功标准：

- 入库一条资料后，对应 `material_chunks.embedding` 非空。
- 选中该知识库提问相关问题 → 回答带来源引用，点击可回到资料。
- 不选知识库/标签 → 普通回答，无「参考资料」伪造块。
- 库内无可用片段时 → 明确「暂无相关资料」，不编造带引用的长答案。
- `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 仅存在于 Edge Function 密钥，不进前端包。

## 2. 非目标（本切片）

- 笔记「一键生成」与灵感卡片进笔记的完整闭环
- 笔记 ↔ 知识库同步
- 真实 DeepSeek 资料摘要/标签（**已另开切片落地**，见 DeepSeek summary/tags 设计）
- 托管解析 / 生产整站上线
- ~~联网搜索的真实实现~~（已由 `2026-09-17-home-online-qwen-search-design.md` 落地：开联网 → QW + 百炼网页搜索 + 来源 UI；RAG 仍强制不联网）
- 多路召回 / Bailian rerank（属 A′ 切片，已落地）

## 3. 模式规则

| 条件 | `answer_mode` | 联网 | 模型 | 引用 |
| --- | --- | --- | --- | --- |
| 首页未选 KB 且未选标签 | `general` | 尊重 UI 开关（开联网 → QW 真搜，见 2026-09-17 切片） | DS快速/深度 或 QW | 无（联网时有 webSources） |
| 首页选了任一 KB 或标签 | `rag` | 强制关闭 | 用户选快速/深度 | 有真实 `message_citations` |
| 知识库模块内对话 | `rag` | 强制关闭；范围=当前库 | 用户选快速/深度 | 有 |

服务端以请求中的 `knowledge_base_ids` / `tag_filters` 为准强制模式，**不信任**客户端传来的 `answer_mode` / `online_enabled`。

多知识库：并集。多标签：AND。仅标签：在用户全部知识库内筛。

## 4. 架构

```
资料 ready
  → embed-material（Edge）
  → 百炼 text-embedding-v4
  → 写回 material_chunks.embedding

用户发消息
  → chat-message（Edge）
  → general: DeepSeek(chat|reasoner)（开联网见 QW 切片）
  → rag: LLM query rewrite → 多路召回 → RRF/最高 similarity → diversify
       → Bailian/light rerank → 编号片段 prompt → DeepSeek → sanitize
  → 持久化 chat_messages +（rag 时）message_citations
  → 前端 AnswerContent（结构层级 / 短标题 / 行内 [n] 浮卡）
```

| 组件 | 职责 |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | `embedTexts`、`deepseekChat`、`rerankDocuments`、`rewriteQueriesWithLlm` |
| `supabase/functions/_shared/rag.ts` / `ragRetrieve.js` | 改写编排、多路融合、rerank、组 prompt、解析 `[n]` |
| `supabase/functions/embed-material` | 单条资料批次写 embedding |
| `supabase/functions/chat-message` | 一轮对话 |
| `match_material_chunks` / `match_material_chunks_keyword` | 向量 / 关键词 RPC |
| `refind-demo` chat API + Home/KB UI | 调真实接口；`formatAnswerText` + 行内 `[n]` 浮卡 |

密钥（Supabase Edge secrets，勿提交仓库、勿贴聊天）：

- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`（embedding + rerank）

向量维度：以百炼 `text-embedding-v4` 实际返回为准（计划默认 1024；迁移/RPC 与之一致）。

## 5. 数据与触发

- 复用已有表：`material_chunks`、`chat_messages`、`message_citations`、`chat_conversations`。
- `chat_conversations` 增加 `surface`（`home`|`knowledge`）与可选 `knowledge_base_id`，用于首页 / 各知识库历史分面（见 `2026-09-15-chat-history-surfaces-design.md`）。
- `parse-material`（或 webhook）在资料变为 `ready` 且已有 chunk 文本后，异步调用 `embed-material`。
- 资料删除 / 正文大改：按既有 chunk 策略重建或清空 embedding。

## 6. 前端行为

- Composer 已有 `thinkingMode: fast|deep` → 请求体带对应 DeepSeek 模型。
- 严格 RAG 回答：句末 `[n]` 行内角标 + 浮卡；不足文案「暂无相关资料」。
- 通用回答：不渲染知识库引用区。
- 失败：密钥缺失、embedding 失败、检索为空等 → 可读中文错误/不足提示，不静默回落到假 demo 文案。

## 7. 验收清单

- [x] 新入库 ready 资料的 chunk 有非空 embedding
- [x] 有范围提问：回答含真实引用，无捏造资料标题
- [x] 无范围提问：无引用 UI；快速/深度均可发出
- [x] 空库 / 无关问题：资料不足提示
- [x] 前端包与 git 中无 API Key 明文
- [x] Edge secrets 配置后端到端可走通一轮
- [x] A′ 多路召回 + rerank 已接线（详见 A′ 设计验收）

## 8. 后续切片（不在本次基础片）

- ~~C：DeepSeek 真摘要与标签~~（已落地）
- ~~A′：多路召回 + rerank + 多轮~~（已落地，见 2026-09-16 设计）
- ~~LLM 检索语义改写~~（已落地，见 2026-09-17 llm-query-rewrite）
- ~~回答结构层级 + 短标题标准~~（已落地，见 answer-inline-citations）
- **下一阶段：笔记生成 + 灵感收藏落库 + 引用进卡片**（产品确认：基于已调好的 AI 回答推进）
- 笔记 ↔ KB 同步
- ~~联网真实检索~~（已落地，见 `2026-09-17-home-online-qwen-search-design.md`）
- 托管上线与生产密钥轮换（笔记闭环后再做）
