# Refind 阶段二 / 阶段三路线图（2026-09-13）

> 状态：已与产品确认（方案 A）  
> 最近修订：2026-09-17（RAG/回答打磨切片收口；下一阶段 = 笔记智能化 → 上线）  
> 前置：阶段一 = `refind-demo` 高保真原型（首页 / 知识库 / 笔记·灵感卡片交互已落地）  
> 目标产品：PRD / Spec 定义的 **V1.0 个人知识库基础闭环**（真实后端 + 真实 AI/RAG + 部署）

## 1. 阶段划分总览

| 阶段 | 名称 | 交付物 | 笔记模块位置 |
| --- | --- | --- | --- |
| **一** | 高保真原型 | `refind-demo` 本地交互、设计/PRD/Spec 对齐 | 纯前端状态；规则已确认 |
| **二** | 后端地基 | 登录（含用户名）、Postgres、RLS、对象存储、真实上传解析、资料 CRUD；**解析补强**（文档 → OCR → 链接双路径）；**设置页 / 平台连接 UI（演示态 A）** | **持久化**：笔记本、笔记、灵感卡片、素材关系、富文本 JSON；**不含**真实 AI 生成 |
| **三** | 智能与上线 | DeepSeek RAG、引用、笔记 AI 生成、笔记↔知识库同步、**真实平台登录 B**、**托管解析**、部署 | **智能化**：生成笔记、内联引用回链、同步资料、生产环境 |

**方案 A 原则：** 笔记不单独成阶段；二阶段「存得住、改得动」，三阶段「生成得对、引用可溯、同步可上线」。

### 1.0 阶段三执行切片状态（2026-09-17）

| 切片 | 内容 | 状态 |
| --- | --- | --- |
| RAG 基础 | embedding + `chat-message` + 引用浮卡 | **已落地** |
| A′ 准确度 | 多路召回 + Bailian/light rerank + 不足闸门 | **已落地** |
| LLM query rewrite | 检索前语义改写（追问「具体是什么」等） | **已落地** |
| 回答结构 | 大标题/有序递增/· 并列 + 短标题 2～12 字 | **已落地** |
| 首页联网 | QW + 百炼网页搜索 | **已落地** |
| DeepSeek 摘要/标签 | 解析后真摘要与标签 | **已落地** |
| **下一阶段** | **笔记智能化**：富文本 D → 收藏 A → 生成 B → 同步 C | **设计已确认 · 待实现** — `2026-09-17-notes-intelligence-design.md` |
| 上线 | 托管解析 + 平台连接 B + 自定义域名部署 | **笔记闭环后** |

产品确认顺序：**D 富文本（TipTap，大陆+Apple/Windows）→ A→B→C，最终再上线。**

### 1.1 平台连接与解析子路线（2026-09-15 确认）

| 子阶段 | 内容 | 状态 |
| --- | --- | --- |
| A | 设置连接 UI + DB 标记；解析带 `use_saved_session`（本机 Cookie） | 已落地 |
| B · 本机 | 小红书/抖音 Playwright 真实登录 → `dev1:` 会话 + 本机 parser 消费 | **已落地**（开发机） |
| B · 托管 | 托管登录/解析；去掉本机 parser 依赖 | **下一步（生产）** |
| C | 真实 DeepSeek 摘要 | 阶段三 |

开发期链接预取依赖本机 `tools/platform-parser`；**生产必须托管解析服务**，用户不可自启本机 parser。

## 2. 后端技术栈（Spec / PRD 已定）

| 层级 | 选型 | 用途 |
| --- | --- | --- |
| 关系数据库 | **Supabase Postgres** | 用户、知识库、资料、标签、会话、消息、笔记、灵感卡片、引用关系 |
| 向量检索 | **pgvector**（Postgres 扩展） | 资料片段 embedding 相似度检索 |
| 对象存储 | **Supabase Storage**（私有 bucket） | 上传文件 `storage_object_key`（`userId/uuid.ext`）；不暴露公开 URL |
| 认证 | **Supabase Auth** | 邮箱 + 密码 + 用户名（`profiles.display_name`）；`user_id` 隔离 |
| 访问控制 | **RLS**（Row Level Security） | 所有表按当前用户校验 |
| API / 编排 | **Supabase Edge Functions** | 解析编排、向量化、RAG、生成、笔记同步、脑图等 |
| 生成模型 | **DeepSeek Chat** | 摘要、标签、对话回答、笔记生成、脑图 |
| 向量模型 | **阿里云百炼 text-embedding-v4** | 资料片段与问题向量化（中文语义） |
| 主流平台解析 | **MediaCrawler** + 平台适配器 | 小红书、抖音、知乎、B 站、微信公众号（**可选**用户会话） |
| 其他网页解析 | **Crawl4AI / Readability**；必要时 **Playwright 匿名渲染** | 搜到就藏；不要求用户在目标站注册 |
| 前端（延续） | **React 19 + Vite** | 由 demo 逐步接真实 API；部署见阶段三 |
| 当前云区域 | **Supabase `ap-northeast-1`（东京）** | 相对美区更利于亚太访问；旧美区项目仅作备份/待收尾 |
| 部署（阶段三） | **Supabase prod** + 前端静态托管（Vercel **或** Cloudflare Pages）+ **自定义域名**；可选 Cloudflare 代理规避 `*.vercel.app` 国内不可达；**托管解析服务**单独部署 | 生产环境与密钥管理 |

> 解析失败三次 → `link_only` / `attachment_only`。抖音/B 站：内嵌播放（不落盘）+ 正文（文案/字幕）+ AI 摘要；不做 ASR、不入库评论。图片 OCR 属 V1。

## 3. 阶段二：后端地基（详细范围）

### 3.1 必做

1. **Supabase 项目**：Auth、Postgres、Storage、Edge Functions、环境变量。
2. **Schema + RLS**：Spec §3 核心表——`profiles`（含 `display_name`）、`knowledge_bases`、`materials`、`material_chunks`、`tags`、会话与消息、**`notebooks`、`notes`、`inspiration_cards`、`note_material_links`、`note_revisions`**；含 `platform_connections`（含 owner SELECT）。
3. **认证闭环**：注册（邮箱+密码+用户名）、登录、登出、忘记密码、注销（含级联清理规则）；设置页可改用户名与密码。
4. **知识库 CRUD**：默认知识库自动创建；资料列表/详情；**侧栏列表常显 + 搜索**（见 `2026-09-15-sidebar-kb-empty-states.md`）。
5. **真实上传与解析**：
   - 链接入库 + 异步解析状态机（`processing → ready / failed / link_only`）；
   - 文件上传至 Storage → 解析 → 摘要/标签（可先 stub DeepSeek，或接真实 API 作为二阶段末任务）；
   - **文档文本提取**（PDF/DOCX/PPTX/XLSX）已纳入阶段二；
   - **图片 OCR**、**链接双路径加强**（MediaCrawler + 匿名网页抽取）为阶段二补强任务（计划 Task 8）；开发期浏览器预取本地 parser；
   - 解析成功后写入 chunks；**向量索引可 stub 或延后到阶段三首任务**（见边界）。
6. **笔记持久化（无 AI）**：
   - 笔记本 CRUD、笔记 CRUD、灵感卡片 CRUD；
   - 富文本 `rich_text_json` + 自动保存；
   - 整理为笔记：创建笔记并写入 `inspiration_card_ids` / 素材关系；
   - 双栏/全屏编辑与原型规则一致（新建无素材、整理有素材）。
7. **前端接 API**：替换 `refind-demo` 中 demo 数据与 local state；保留 UI 行为不变。
8. **设置页（平台连接 A）**：连接内容平台 UI + 演示态会话标记；账户与安全。

### 3.2 阶段二明确不做

- 真实 RAG 对话与严格引用映射；
- 笔记「生成笔记」调用 DeepSeek（按钮可 disabled 或保留 demo 文案）；
- 笔记同步知识库双向更新；
- 脑图生成；
- **真实平台扫码登录（B）**与生产级托管解析（可在阶段二末 / 阶段三初）；
- 生产部署与域名（除 dev/staging 环境）；
- 要求用户为长尾网站逐一注册；视频 ASR / 评论区入库。

### 3.3 阶段二验收

- 新用户注册后拥有默认知识库与展示用户名；
- 上传/粘贴链接后资料卡片真实入库，解析状态可观测；
- 公开网页可匿名解析；主流平台可走 MediaCrawler（连接可选）；失败可降级 `link_only`；
- 笔记与灵感卡片跨刷新持久化；
- 用户 A 无法读取用户 B 的任何数据（RLS 实测）；
- 原型已确认的笔记入口分流（新建/整理/全屏/返回）在接 API 后仍成立；
- 侧栏知识库列表在未进入知识库页时可见可搜；进入后选中规则符合 2026-09-15 规格。

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
8. **平台连接 B + 托管解析**：真实登录会话；生产解析服务 URL；去掉本机 parser 依赖。
9. **部署上线**：Supabase prod（东京）、Edge Functions secrets、前端 build + 自定义域名（注意 `*.vercel.app` 国内常不可达）、最小监控。

### 4.2 阶段三可顺延（V1.5）

- ~~混合检索 / rerank~~（A′ 已落地；LLM query rewrite 已落地）
- 平台 MediaCrawler / 匿名网页抽取质量深化
- 笔记生成后可编辑策略深化（sections vs contentEditable 统一）
- 邮箱验证、手机号登录
- 大陆正式合规部署（国内云 + 备案）若需面向大陆正式商用

### 4.3 阶段三验收

- 严格 RAG 回答仅引用 ready 资料；资料不足时有明确边界说明；
- 回答结构层级与短标题可读（与 `answer-inline-citations` 一致）；追问检索不因裸指代落空；
- 生成笔记后引用可打开卡片与资料上下文；
- 笔记同步至知识库后，任一端编辑另端一致；
- 生产环境可完成注册 → 入库 → 提问 → 收藏 → 整理笔记 → 生成 → 同步 全链路；
- 国内用户可通过**自定义域名**打开前端；链接解析不依赖用户本机启动 parser。

## 5. 与 PRD 版本号对照

| PRD 章节 | 对应阶段 |
| --- | --- |
| §8.4 V1.0 个人知识库基础闭环 | 阶段二 + 阶段三 |
| §8.4 V1.5 检索质量与资料管理优化 | 阶段三之后 |
| §8.4 V2.0 个人知识应用升级 | 远期 |

## 6. 实施计划文档

- `docs/superpowers/plans/2026-09-13-phase2-backend-foundation.md`（含 2026-09-14 Task 8 解析补强）
- `docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`（含部署与托管解析；**下一执行重点 = 笔记 Task**）
- `docs/superpowers/plans/2026-09-16-ai-accuracy-multi-recall-rerank.md`（A′ · 已完成）
- `docs/superpowers/plans/2026-09-17-llm-query-rewrite.md`（检索改写 · 已完成）
- `docs/superpowers/specs/2026-09-15-answer-inline-citations-design.md`（回答结构 · 已落地）
- `docs/superpowers/specs/2026-09-14-platform-connection-settings-ui.md`
- `docs/superpowers/specs/2026-09-14-link-parse-pipeline-trial.md`
- `docs/superpowers/specs/2026-09-15-sidebar-kb-empty-states.md`
- `docs/superpowers/specs/2026-09-13-notes-workspace-remediation-design.md`（笔记 UI 原型规则 · 智能化时复用）

## 7. 非目标

- 本路线图不推翻阶段一已确认的 UI/交互；后端实现以 Spec §5.7 / §9.5 / §12 与 notes-workspace-remediation 为准。
- 不在阶段二引入第二套后端框架（如自建 Nest/FastAPI 主 API）；编排以 Supabase 为中心；MediaCrawler 与网页抽取服务为外置/Edge 可调用能力。
