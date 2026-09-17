# 首页联网搜索（QW + 来源 UI）设计

> 日期：2026-09-17  
> 状态：**已落地**（2026-09-17）  
> 关联：`2026-09-15-rag-chat-foundation-design.md`（原「联网占位」由本切片替换）  
> 用户确认：2026-09-17 — 方案 2（开联网走通义）、模型菜单加 QW、开联网自动切 QW、默认不联网、回答带来源 UI

## 1. 目标

把首页「联网」从占位开关升级为真实网页搜索，并在回答区展示可点击的网络来源。

成功标准：

- 默认：**不联网** + **DS快速**。
- 开联网 → 自动切到 **QW**，DS 快速/深度置灰不可选；关联网 → 恢复开联网前的 DS 快速/深度。
- 开联网的通用问答能引用实时网页信息，回答下方出现「来源 N：标题」，点击新标签打开原 URL。
- 选知识库/标签或知识库面板对话：仍强制不联网、走严格 RAG（不变）。
- 无搜索结果/无来源时：不展示空来源条；不伪造链接。

## 2. 非目标

- RAG 模式下混入网页搜索。
- 独立 Tavily/Bing/Serper 密钥（本切片用百炼模型自带搜索）。
- 流式输出改造。
- 来源持久化进 `message_citations` 表（V1 可随消息 JSON/响应字段返回；若落库则另开迁移，见 §6）。
- 将 QW 用于知识库 RAG 生成（V1 RAG 仍用现有 DeepSeek 路径）。

## 3. 产品规则

### 3.1 模型选择

首页 composer 模型菜单三项：

| 芯片文案 | 含义 | 默认 |
| --- | --- | --- |
| DS快速 | DeepSeek 非思考 | **是** |
| DS深度 | DeepSeek 思考/reasoner | 否 |
| QW | 通义（百炼），可联网 | 否 |

### 3.2 联网与模型联动

| 用户操作 | 结果 |
| --- | --- |
| 打开「联网」 | `online=true`；模型强制为 QW；DS 两项禁用 |
| 关闭「联网」 | `online=false`；模型恢复为打开联网前的 DS快速/DS深度 |
| 不联网时手动选 QW | 允许；走通义闲聊，**不**启用网页搜索 |
| 选任意知识库或 `#` 标签 | 强制 `online=false`（现有）；联网按钮禁用 |

记忆：在组件/会话 scope 中保留 `lastDeepSeekMode: 'fast' | 'deep'`，供关联网时恢复。

### 3.3 模式与后端

| 条件 | `answer_mode` | 联网搜索 | 生成模型 | 来源 UI |
| --- | --- | --- | --- | --- |
| 无 KB/标签，`online=false`，DS | `general` | 否 | deepseek-chat / reasoner | 无 |
| 无 KB/标签，`online=false`，QW | `general` | 否 | 通义（无 enable_search） | 无 |
| 无 KB/标签，`online=true` | `general` | **是** | 通义 + `enable_search` | **网络来源条** |
| 有 KB/标签或 knowledge surface | `rag` | 否（忽略 online） | 现有 DeepSeek RAG | 资料引用 |

服务端仍以 `knowledgeBaseIds` / `tagFilters` / `surface` 判定 RAG；`onlineEnabled` 仅在 `general` 生效。

## 4. 技术方案（推荐）

**百炼 OpenAI 兼容 Chat Completions + `enable_search`。**

- Key：现有 `DASHSCOPE_API_KEY`。
- 联网模型：`qwen-plus`（可配置 env `BAILIAN_ONLINE_MODEL`，默认 `qwen-plus`）。
- 请求扩展（兼容模式 `extra_body` 或同级字段，以实现时百炼文档为准）：
  - `enable_search: true`
  - `search_options.enable_source: true`（拿到 `search_info.search_results`）
- 不联网的 QW：同一通义模型，`enable_search` 不传或 `false`。
- 删除 general 分支里「当前版本未启用联网搜索」的系统提示。

解析响应：

- 正文：`choices[0].message.content`（保持现有去 Markdown 可读化策略，若通义输出结构不同则做最小适配）。
- 来源：从 `search_info.search_results`（或文档等价字段）映射为：

```ts
type WebSource = {
  order: number;      // 1-based
  title: string;
  url: string;
};
```

过滤无 `url` 的项；`order` 按返回顺序编号。

## 5. 前端

### 5.1 HomeComposer

- 模型菜单增加 QW；开联网时 DS 项 `disabled`，当前值显示 QW。
- `onSubmit` 增加或沿用字段：`thinkingMode: 'fast' | 'deep' | 'qwen'`（或并列 `model: 'ds-fast' | 'ds-deep' | 'qwen'` + 保留 thinkingMode 仅对 DS）。
- 推荐请求字段：`modelId: 'ds-fast' | 'ds-deep' | 'qwen'`，`onlineEnabled: boolean`。

### 5.2 来源 UI

- 复用回答区引用条视觉（与 RAG「引用 N：标题」同族）。
- 文案区分：网络来源用「来源 N：{title}」（或「网页 N」）；RAG 保持「引用 N」。
- 点击：`window.open(url, '_blank', 'noopener,noreferrer')`。
- `AnswerContent` / `HomeConversation`：当 `message.webSources?.length` 时渲染；与 `citations`（资料）互斥于同一条消息（general 联网只有 webSources，rag 只有 citations）。

### 5.3 API 映射

`sendChatMessage` / `mapChatResponseToMessage` 增加：

- 请求：`modelId`（或等价）、现有 `onlineEnabled`。
- 响应：`webSources: WebSource[]`；`answerMode` 仍为 `general`。

## 6. 数据与落库（V1）

- **最低要求**：响应带回 `webSources`，前端当轮展示即可。
- **可选加固**：`chat_messages` 增加 `web_sources jsonb`（或 metadata），便于历史回放仍显示来源。若不做迁移，历史消息重载后来源条可空——需在实现计划中二选一；**推荐 V1 做 jsonb 列**，与灵感/历史一致。

## 7. 错误与降级

- 搜索失败或模型报错：用户可见错误文案；不假装已联网成功。
- `enable_search` 不可用（账号未开通）：明确错误，便于运维检查百炼控制台。
- 有正文但无 `search_results`：仍展示正文，不出来源条。

## 8. 测试要点

- 默认：不联网、DS快速。
- 开联网 → 芯片变 QW，DS 禁用；请求 `onlineEnabled=true` + qwen 模型。
- 关联网 → 回到先前 DS 模式。
- 选 KB 后联网禁用且不发搜索。
- Mock 带 `webSources` 的响应 → UI 出现可点击来源。
- 单元：响应解析把 `search_info` 映成 `webSources`。

## 9. 验收

- [x] 默认不联网 + DS快速
- [x] 开联网自动 QW + 真搜（单元/集成测试覆盖；人工验一条时事/天气类问题可选）
- [x] 来源条可打开真实 URL
- [x] 关联网恢复 DS
- [x] RAG / 选库路径无网页搜索、无网页来源条
