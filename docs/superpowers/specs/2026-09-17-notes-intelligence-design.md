# 笔记智能化 + 富文本编辑器设计（2026-09-17）

> 状态：**已与产品确认**（范围 A + 富文本 D1；上线另做）  
> 分支：`phase3-notes-intelligence-launch`  
> 前置：AI 回答链路（RAG / 结构 / 引用）已调好；笔记 CRUD / 灵感卡片表已落地（Phase 2）  
> 关联：`2026-09-13-notes-workspace-remediation-design.md`（UI 入口）、`2026-09-13-phase3-ai-rag-launch.md` Task 3–5、`2026-09-18-materials-outline-chapters-design.md`（素材成章与生成顺序）  
> 字体规范来源：用户《笔记文档类编辑器 字体层级规范（可直接上线）》

## 1. 目标

在已有笔记工作台与持久化之上，交付：

1. **D. 富文本工具栏**：稳定、像正常文档的编辑体验（大陆可用；Apple + Windows）
2. **A. 收藏落库补齐**：回答划选/整答 → 真实灵感卡片 + 引用快照
3. **B. 生成笔记**：Edge `generate-note` + 内联 `[n]` 回链卡片
4. **C. 同步知识库**：Edge `sync-note` + 双向更新与删除策略

成功标准见 §8。

## 2. 非目标（本切片）

- 生产上线 / 托管解析 / 平台连接 B / 自定义域名
- 脑图
- 改 RAG 主链路（除非笔记阻塞）
- 无限自定义字号、表格、批注、协作光标
- Spec 中的代码块 / 分割线工具（本阶段可顺延，避免工具栏过挤）

## 3. 执行顺序（已确认 · D1）

```text
D 富文本（TipTap）→ A 收藏补齐 → B 生成笔记 → C 同步知识库
→（另阶段）上线
```

先稳编辑器，再让 AI 生成写入同一 schema，避免生成正文套在半残 `contentEditable` 上。

## 4. D · 富文本编辑器

### 4.1 技术选型

| 项 | 决策 |
| --- | --- |
| 引擎 | **TipTap（ProseMirror）**，经 npm 打进 Vite 产物 |
| 部署 | **禁止** Google Fonts、外网 CDN、需海外账号的 SaaS 编辑器 |
| 大陆 | 依赖本地打包；中文 IME 组字不断词（Win / macOS 实测） |
| Apple | Mac / iPad / iOS Safari；PingFang 等系统中文；触控选区可用 |
| Windows | Edge / Chrome / Firefox；微软雅黑等回退 |
| 存储 | 仍用 `notes.content` jsonb；编辑器 HTML/JSON 与现有 `text`/`blocks`/`sections` 对齐策略见 §4.4 |

字体栈（本地/系统，不拉外网）：

```text
'Refind Source Han SC', 'PingFang SC', 'Hiragino Sans GB',
'Microsoft YaHei', 'Noto Sans SC', sans-serif
```

### 4.2 工具栏（本阶段必做）

撤销、重做、**样式下拉**、粗体、斜体、下划线、删除线、字体颜色、高亮、对齐（左/中/右）、无序/有序列表、引用、链接。

样式菜单文案（用户可见）：

`标题1` · `标题2` · `标题3` · `正文（默认）` · `辅助正文` · `小字备注`

### 4.3 字体层级（桌面端 · 可上线默认）

基准：正文 **16px**。只开放以下 **6 档**，禁止任意自定义字号。

| 样式 | 菜单 | 字号 | 字重 | 行高 | 颜色 | 上/下边距 |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | 标题1 | 32px | 600 | 40px | `#1D2129` | 0 / 24px |
| H2 | 标题2 | 24px | 600 | 32px | `#1D2129` | 20 / 16px |
| H3 | 标题3 | 20px | **550** | 28px | `#1D2129` | 16 / 12px |
| 正文1 | 正文（默认） | 16px | 400 | 24px | `#1D2129` | 0 / 8px |
| 正文2 | 辅助正文 | 14px | 400 | 20px | `#4E5969` | 0 / 6px |
| 正文3 | 小字备注 | 12px | 400 | 18px | `#86909C` | 0 / 4px |

规则：

- 默认输入 = **正文（默认）**
- 外部粘贴 → 统一成 **正文（默认）**（清外部脏样式）
- 单篇建议仅 1 个 H1（产品提示，不强拦）
- 标题之间 ≥4px 字号差；正文 16→14→12 平缓降级

### 4.4 终端适配

| 终端 | H1 | H2 | H3 | 正文1 | 正文2 | 正文3 | 间距 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 桌面 | 32 | 24 | 20 | 16 | 14 | 12 | 上表 |
| iPad | 30 | 22 | 19 | **17** | 15 | 13 | 约桌面 80% |
| 手机 | 28 | 22 | 18 | 15 | 14 | 12 | 约再缩 30% |

跨端保持 `H1 > H2 > H3 > 正文1 > 正文2 > 正文3`。

### 4.5 与 `notes.content` 的关系

- 编辑态：TipTap 文档为真相；自动保存序列化为 jsonb（保留 `text` 纯文本摘要 + 结构化 `sections`/`html` 字段，以实现计划为准，须可逆回编辑器）
- AI 生成（B）：输出 `sections`（含 `cardId` / `citationIndex`）写入同一模型，打开后可继续用工具栏改
- 撤销/重做：编辑器事务栈覆盖文字与格式；生成前另写 `note_revisions`

## 5. A · 灵感收藏落库

- 划选 / 整答 → `createInspirationCard`（已有 API）：`content_snapshot`、`source_question_snapshot`、`answer_mode`、`citation_snapshot`、会话/消息 ID
- RAG：快照含引用元数据；通用：不伪造资料引用
- 「加入笔记」/「整理为笔记」走既有 `note_inspiration_cards` 关系
- 验收：刷新后灵感页仍在；引用信息可打开

## 6. B · 生成笔记

入口：有素材时可点「生成笔记」；空素材禁用。

服务端 `generate-note`：

1. 校验归属 → 保存当前正文 → `note_revisions`（`before_generate`）
2. 按 **章节大纲顺序**（`content.outline`：章节 → 章内卡 → 未归章）读取绑定卡片 + 快照 +「我的想法」；**无大纲时**回退当前扁平素材顺序（`inspirationCardIds` / 关系表顺序）
3. DeepSeek → `sections`（RAG 绑 `cardId`；通用不造资料引用）
4. 原子替换 `notes.content`

前端：生成中禁编；成功后滚至文首；`[n]` hover 预览（夹取视口）→ 点击开卡片详情。删卡片只移出素材，不回改已生成正文。

## 7. C · 同步知识库

- 多选知识库 → `sync-note` → 每库一篇 `origin_type=note` 资料 + 关联表
- 笔记编辑 → 推全部同步资料并触发索引；资料编辑 → 写回笔记再扇出
- 删资料/库 → 只解绑；删笔记 → 删全部同步资料
- UI 非阻塞 toast

## 8. 验收清单

- [ ] Win + Mac：6 档样式、颜色/高亮/对齐/列表可用；IME 正常；样式视觉符合 §4.3
- [ ] iPad / 手机断点字号符合 §4.4
- [ ] 粘贴外部 HTML 落入正文（默认）
- [ ] 收藏 → 刷新 → 卡片仍在且 RAG 快照完整
- [ ] 生成笔记 → 真 AI 正文；`[n]` 可预览/开卡片
- [ ] 同步 1～N 库后可检索；双向编辑与删除策略正确
- [ ] 构建产物无外网 CDN / Google Fonts

## 9. 风险

| 风险 | 缓解 |
| --- | --- |
| 旧笔记 HTML / execCommand 脏数据 | 打开时 normalize → 6 档 schema；无法识别则正文默认 |
| TipTap 体积 | 按需扩展；不引入协作套件 |
| 生成与富文本 schema 不一致 | B 在 D 之后；生成 mapper 单测 |
| 同步打爆 embedding | 同步后异步 embed；UI 不阻塞 |

## 10. 文档同步

落地后回写：PRD §6.11 / Spec §5.7、路线图 §1.0、`phase3-ai-rag-launch.md` Task 状态。

## 11. 2026-09-18 as-built 补记

- **B `generate-note`：** 系统提示强调覆盖卡片要点、文白与分点平衡（该分点处分点、该叙述处叙述）；尊重 `content.outline`；未归章卡仍进 prompt；部署 DeepSeek + 充足 `max_tokens`。
- **C `sync-note`：** Edge Function `supabase/functions/sync-note` 已实现；同步资料 `origin_type=note`；前端同步成功后刷新材料列表 / 「查看知识库」对话框；来源筛选含「笔记」。
- **UX：** 去掉「已保留生成前版本」强 toast；新建知识库弹窗无 sparkles；placeholder `#9EA4AD`。
- 文档已同步：`output/design.md` §10.8、PRD §9.13、Spec §15。
