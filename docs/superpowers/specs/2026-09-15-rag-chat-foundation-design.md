# 严格 RAG 对话基础（阶段三 · 第一片）设计

> 日期：2026-09-15  
> 状态：**待实现**（设计已确认）  
> 前置：阶段二后端基础（资料解析、`material_chunks`、会话表）已落地  
> 关联计划：`docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`（本切片对应 Task 1–2）  
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
- 库内无可用片段时 → 明确「资料不足」类提示，不编造带引用的长答案。
- `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY` 仅存在于 Edge Function 密钥，不进前端包。

## 2. 非目标（本切片）

- 笔记「一键生成」与灵感卡片进笔记的完整闭环
- 笔记 ↔ 知识库同步
- 真实 DeepSeek 资料摘要/标签（可继续 stub，或另开切片）
- 托管解析 / 生产整站上线
- 联网搜索的真实实现（本切片：通用模式可保留开关 UI；服务端可先按「不联网」或占位，不伪造网页来源）

## 3. 模式规则

| 条件 | `answer_mode` | 联网 | 模型 | 引用 |
| --- | --- | --- | --- | --- |
| 首页未选 KB 且未选标签 | `general` | 尊重 UI 开关（实现可先弱化） | 用户选快速/深度 | 无 |
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
  → general: DeepSeek(chat|reasoner)
  → rag: 问题向量化 → match_material_chunks → 带编号片段的 prompt → DeepSeek
  → 持久化 chat_messages +（rag 时）message_citations
  → 前端渲染回答与引用
```

| 组件 | 职责 |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | `embedTexts`、`deepseekChat`（按 model 分流） |
| `supabase/functions/_shared/rag.ts` | 检索、组 prompt、解析 `[n]` 引用 |
| `supabase/functions/embed-material` | 单条资料批次写 embedding |
| `supabase/functions/chat-message` | 一轮对话 |
| `match_material_chunks` RPC | pgvector 相似度 + 用户/KB/标签过滤 |
| `refind-demo` chat API + Home/KB UI | 调真实接口；去掉假 citation |

密钥（Supabase Edge secrets，勿提交仓库、勿贴聊天）：

- `DEEPSEEK_API_KEY`
- `DASHSCOPE_API_KEY`

向量维度：以百炼 `text-embedding-v4` 实际返回为准（计划默认 1024；迁移/RPC 与之一致）。现有 `embedding vector` 无维度约束时可先 `alter` 定维并建索引。

## 5. 数据与触发

- 复用已有表：`material_chunks`、`chat_messages`、`message_citations`、`chat_conversations`。
- `chat_conversations` 增加 `surface`（`home`|`knowledge`）与可选 `knowledge_base_id`，用于首页 / 各知识库历史分面（见 `2026-09-15-chat-history-surfaces-design.md`）。
- `parse-material`（或 webhook）在资料变为 `ready` 且已有 chunk 文本后，异步调用 `embed-material`。
- 资料删除 / 正文大改：按既有 chunk 策略重建或清空 embedding（实现计划细化；至少保证删除级联后无孤儿引用）。

## 6. 前端行为

- Composer 已有 `thinkingMode: fast|deep` → 请求体带 `model: 'deepseek-chat' | 'deepseek-reasoner'`（或服务端映射同义枚举）。
- 严格 RAG 回答：展示参考资料数量与可点引用；引用绑定真实 `material_id` / chunk。
- 通用回答：不渲染知识库引用区。
- 失败：密钥缺失、embedding 失败、检索为空等 → 可读中文错误/不足提示，不静默回落到假 demo 文案。

## 7. 验收清单

- [ ] 新入库 ready 资料的 chunk 有非空 embedding
- [ ] 有范围提问：回答含真实引用，无捏造资料标题
- [ ] 无范围提问：无引用 UI；快速/深度均可发出
- [ ] 空库 / 无关问题：资料不足提示
- [ ] 前端包与 git 中无 API Key 明文
- [ ] 本机/云端 Edge secrets 已配置两把 Key 后，端到端可走通一轮

## 8. 后续切片（不在本次）

- C：DeepSeek 真摘要与标签
- 笔记生成 + 引用进卡片
- 笔记 ↔ KB 同步
- 联网真实检索（若产品仍要）
- 托管上线与生产密钥轮换
