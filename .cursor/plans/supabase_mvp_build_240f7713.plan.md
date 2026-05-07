---
name: Supabase MVP Build
overview: 基于你确认的技术栈（纯 Web + Supabase 一体化 + Vercel 部署），规划一个可上线的 MVP：登录、云端收藏数据、添加 URL 后抓取解析并用 DeepSeek 生成摘要/标签。
todos:
  - id: init-web
    content: 初始化 Next.js Web 项目骨架与基础页面路由（Auth/主页/添加/详情/设置）
    status: pending
  - id: setup-supabase
    content: 创建 Supabase 项目、开启 Email/Password Auth、准备 env 变量与本地/线上配置说明
    status: pending
  - id: db-schema-rls
    content: 编写 Postgres 表结构、索引与 RLS policies（profiles/collections/bookmarks/tags/bookmark_tags）
    status: pending
  - id: edge-ingest
    content: 实现 Edge Function：抓取解析 URL + 调 DeepSeek 生成摘要/标签 + 写入数据库
    status: pending
  - id: frontend-integrate
    content: 前端接入 Supabase Auth 与数据读写；新增收藏调用 ingest function；失败可重试
    status: pending
  - id: deploy-vercel
    content: 配置 Vercel 环境变量并部署；做端到端验收
    status: pending
isProject: false
---

## 目标与边界
- **形态**：纯 Web
- **后端**：Supabase（Auth + Postgres + Storage + Edge Functions）
- **部署**：Vercel（前端） + Supabase（后端）
- **数据**：必须登录、云同步
- **AI**：添加收藏后自动生成（失败可重试）
- **元信息策略**：后端抓取网页 HTML → 提取 title/站点名/正文片段 → DeepSeek 生成摘要/标签
- **平台支持范围（MVP）**：\n+  - 通用网页：尽力抓取解析\n+  - B 站：尽力抓取解析\n+  - 知乎：尽力抓取解析\n+  - 小红书/抖音：仅保证**可识别平台 + 可保存链接**，不承诺自动解析（失败则提示手动补充）

## 关键设计决策
- **密钥安全**：DeepSeek Key 仅存 Supabase Edge Function Secrets；前端永不持有。
- **抓取与解析**：由 Edge Function 完成（或必要时走外部 fetch/解析服务），前端只提交 URL。
- **平台识别**：仅基于 URL `hostname` + 路径规则映射到 `source_platform`；与抓取解析解耦（即使解析失败也能稳定识别来源）。
- **权限模型**：Postgres Row Level Security（RLS）按 `auth.uid()` 隔离数据。

## 数据模型（MVP）
- `profiles`：用户资料（头像/昵称等）
- `collections`：收藏夹（用户自有）
- `bookmarks`：收藏条目（url、title、source、excerpt、summary、ai_status、created_at 等）
- `tags`：标签（用户自有）
- `bookmark_tags`：多对多关系

## 后端（Supabase）
- **SQL 迁移**：在 `supabase/migrations/*.sql` 建表、索引、触发器（如更新时间戳）。
- **RLS**：`supabase/policies.sql` 或在 migration 中定义；只允许用户访问自己的数据。
- **Edge Functions**：
  - `supabase/functions/bookmark_ingest/index.ts`
    - 输入：`{ url, collection_id? }`
    - 流程：校验 URL → 抓取 HTML → 提取 title/正文片段 → 调 DeepSeek → 写入 `bookmarks` + `tags`
    - 返回：bookmark 记录（含 summary/tags）
  - `supabase/functions/bookmark_retry_ai/index.ts`
    - 输入：`{ bookmark_id }`
    - 流程：重新调 DeepSeek 更新摘要/标签

## 前端（Next.js）
- **样式**：Tailwind CSS（可选：后续引入 `shadcn/ui` 加速表单/弹窗/Toast 等基础组件）
- **Auth**：Supabase Email/Password（注册/登录/退出、会话保持）
- **页面最小集**：登录/注册、主页列表+搜索、添加收藏（URL 输入）、收藏详情（查看/编辑）、设置
- **数据访问**：
  - 直接读写 Postgres（通过 `@supabase/supabase-js` + RLS）
  - 写入/AI 生成走 Edge Function（`supabase.functions.invoke(...)`）

## 部署与环境变量
- `web/.env.local`（本地）与 Vercel Project Env（线上）
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Supabase Edge Function Secrets：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
  - `DEEPSEEK_MODEL=deepseek-v4-flash`

## 验证路径（跑通即算完成）
- 注册/登录成功，刷新页面会话仍在
- 新增一个 URL：后端抓取成功、写入 bookmark、生成 summary + tags
- 搜索（标题/摘要/标签）能过滤
- 只读写自己的数据（RLS 验证）
- Vercel 部署后同样可用
