# Refind 阶段二 / 阶段三路线图（2026-09-13）

> 状态：已与产品确认（方案 A）  
> 前置：阶段一 = `refind-demo` 高保真原型（首页 / 知识库 / 笔记·灵感卡片交互已落地）  
> 目标产品：PRD / Spec 定义的 **V1.0 个人知识库基础闭环**（真实后端 + 真实 AI/RAG + 部署）

## 1. 阶段划分总览

| 阶段 | 名称 | 交付物 | 笔记模块位置 |
| --- | --- | --- | --- |
| **一** | 高保真原型 | `refind-demo` 本地交互、设计/PRD/Spec 对齐 | 纯前端状态；规则已确认 |
| **二** | 后端地基 | 登录、Postgres、RLS、对象存储、真实上传解析、资料 CRUD | **持久化**：笔记本、笔记、灵感卡片、素材关系、富文本 JSON；**不含**真实 AI 生成 |
| **三** | 智能与上线 | DeepSeek RAG、引用、笔记 AI 生成、笔记↔知识库同步、部署 | **智能化**：生成笔记、内联引用回链、同步资料、生产环境 |

**方案 A 原则：** 笔记不单独成阶段；二阶段「存得住、改得动」，三阶段「生成得对、引用可溯、同步可上线」。

## 2. 后端技术栈（Spec / PRD 已定）

| 层级 | 选型 | 用途 |
| --- | --- | --- |
| 关系数据库 | **Supabase Postgres** | 用户、知识库、资料、标签、会话、消息、笔记、灵感卡片、引用关系 |
| 向量检索 | **pgvector**（Postgres 扩展） | 资料片段 embedding 相似度检索 |
| 对象存储 | **Supabase Storage**（私有 bucket） | 上传文件 `storage_object_key`；不暴露公开 URL |
| 认证 | **Supabase Auth** | 邮箱 + 密码注册/登录/忘记密码/注销；`user_id` 隔离 |
| 访问控制 | **RLS**（Row Level Security） | 所有表按当前用户校验 |
| API / 编排 | **Supabase Edge Functions** | 解析编排、向量化、RAG、生成、笔记同步、脑图等 |
| 生成模型 | **DeepSeek Chat** | 摘要、标签、对话回答、笔记生成、脑图 |
| 向量模型 | **阿里云百炼 text-embedding-v4** | 资料片段与问题向量化（中文语义） |
| 受限平台解析 | **MediaCrawler** + 平台适配器 | 小红书、抖音、知乎、B 站、微信公众号（用户已连接会话） |
| 普通网页解析 | 自研/第三方网页解析器 | 公开链接正文提取 |
| 前端（延续） | **React 19 + Vite** | 由 demo 逐步接真实 API；部署见阶段三 |
| 部署（阶段三） | **Supabase 项目** + 前端静态托管（如 Cloudflare Pages / 现有 Sites 打包链路） | 生产环境与密钥管理 |

> 当前仓库 **尚无** 独立后端代码目录；阶段二从 Supabase 项目初始化 + schema migration + Edge Functions 脚手架开始。

## 3. 阶段二：后端地基（详细范围）

### 3.1 必做

1. **Supabase 项目**：Auth、Postgres、Storage、Edge Functions、环境变量。
2. **Schema + RLS**：Spec §3 核心表——`users` 扩展、`knowledge_bases`、`materials`、`material_chunks`、`tags`、会话与消息、**`notebooks`、`notes`、`inspiration_cards`、`note_material_links`、`note_revisions`**。
3. **认证闭环**：注册、登录、登出、忘记密码、注销（含级联清理规则）。
4. **知识库 CRUD**：默认知识库自动创建；资料列表/详情。
5. **真实上传与解析**：
   - 链接入库 + 异步解析状态机（`processing → ready / failed / link_only`）；
   - 文件上传至 Storage → 解析 → 摘要/标签（可先 stub DeepSeek，或接真实 API 作为二阶段末任务）；
   - 解析成功后写入 chunks；**向量索引可 stub 或延后到阶段三首任务**（见边界）。
6. **笔记持久化（无 AI）**：
   - 笔记本 CRUD、笔记 CRUD、灵感卡片 CRUD；
   - 富文本 `rich_text_json` + 自动保存；
   - 整理为笔记：创建笔记并写入 `inspiration_card_ids` / 素材关系；
   - 双栏/全屏编辑与原型规则一致（新建无素材、整理有素材）。
7. **前端接 API**：替换 `refind-demo` 中 demo 数据与 local state；保留 UI 行为不变。

### 3.2 阶段二明确不做

- 真实 RAG 对话与严格引用映射；
- 笔记「生成笔记」调用 DeepSeek（按钮可 disabled 或保留 demo 文案）；
- 笔记同步知识库双向更新；
- 脑图生成；
- 生产部署与域名（除 dev/staging 环境）。

### 3.3 阶段二验收

- 新用户注册后拥有默认知识库；
- 上传/粘贴链接后资料卡片真实入库，解析状态可观测；
- 笔记与灵感卡片跨刷新持久化；
- 用户 A 无法读取用户 B 的任何数据（RLS 实测）；
- 原型已确认的笔记入口分流（新建/整理/全屏/返回）在接 API 后仍成立。

## 4. 阶段三：智能与上线（详细范围）

### 4.1 必做

1. **Embedding + pgvector 索引**：资料 ready 后自动切片向量化；编辑/删除资料同步索引。
2. **RAG 对话**：
   - 首页：无范围 = general（DeepSeek + 可选联网策略）；有 KB/标签 = 严格 RAG；
   - 知识库 AI：仅当前库 strict RAG；
   - 消息与 `message_citations` 持久化。
3. **来源引用**：句末 `[n]`、hover 浮卡、资料片段与「资料已删除」态。
4. **灵感卡片收藏**：从回答划选/整答收藏，写入 `inspiration_cards` + 引用快照。
5. **笔记 AI 生成**：`POST /notes/:id/generate`；生成前 `note_revision`；sections + `cardId` 引用映射；内联 `[n]` hover 预览与回卡片（对齐原型 Task 6）。
6. **笔记 ↔ 知识库同步**：多库同步、`origin_type=note` 资料、双向正文更新、删除策略。
7. **引用链到原文（V1 最小）**：笔记引用 → 灵感卡片 → 资料快照 / 预览窗（对齐原型 `#/material/:id`）。
8. **部署上线**：Supabase prod、Edge Functions secrets、前端 build + CI、监控与错误上报（最小）。

### 4.2 阶段三可顺延（V1.5）

- 混合检索 / rerank；
- 平台 MediaCrawler 全平台联调；
- 笔记生成后可编辑策略深化（sections vs contentEditable 统一）；
- 邮箱验证、手机号登录。

### 4.3 阶段三验收

- 严格 RAG 回答仅引用 ready 资料；资料不足时有明确边界说明；
- 生成笔记后引用可打开卡片与资料上下文；
- 笔记同步至知识库后，任一端编辑另端一致；
- 生产环境可完成注册 → 入库 → 提问 → 收藏 → 整理笔记 → 生成 → 同步 全链路。

## 5. 与 PRD 版本号对照

| PRD 章节 | 对应阶段 |
| --- | --- |
| §8.4 V1.0 个人知识库基础闭环 | 阶段二 + 阶段三 |
| §8.4 V1.5 检索质量与资料管理优化 | 阶段三之后 |
| §8.4 V2.0 个人知识应用升级 | 远期 |

## 6. 实施计划文档

- `docs/superpowers/plans/2026-09-13-phase2-backend-foundation.md`（已写）
- `docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`（已写）

## 7. 非目标

- 本路线图不推翻阶段一已确认的 UI/交互；后端实现以 Spec §5.7 / §9.5 与 notes-workspace-remediation 为准。
- 不在阶段二引入第二套后端框架（如自建 Nest/FastAPI 主 API）；编排以 Supabase 为中心，MediaCrawler 为外置解析服务。
