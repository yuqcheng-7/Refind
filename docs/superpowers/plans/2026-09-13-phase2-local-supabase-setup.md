# Phase 2 本地 / 云端 Supabase 连接指南

> 适用：阶段二后端地基已合入仓库后，在本机首次跑通登录、入库、笔记持久化。  
> 两条路任选其一（也可两条都配）：**A. 本机 Docker + 本地 Supabase** · **B. 云端 Supabase 项目**

---

## 你需要准备什么

| 工具 | 用途 | 安装入口 |
| --- | --- | --- |
| **Docker Desktop** | 本机跑 Postgres / Auth / Storage / Edge（路径 A 必需） | https://www.docker.com/products/docker-desktop/ |
| **Node.js 20+** | 跑 `refind-demo` | 已有则跳过 |
| **Supabase CLI** | 启停本地栈、推迁移、部署函数 | 见下方安装命令 |
| **Supabase 账号**（路径 B） | 云端项目 | https://supabase.com/dashboard |

---

## 路径 A：本机 Docker + 本地 Supabase（推荐开发）

### A1. 安装并启动 Docker Desktop

1. 打开上面的 Docker Desktop 下载页，安装 macOS 版。
2. 打开 Docker Desktop，等菜单栏鲸鱼图标变为 **Running**。
3. 终端验证：

```bash
docker version
docker info
```

两条命令都应成功、无 “Cannot connect to the Docker daemon”。

### A2. 安装 Supabase CLI

```bash
# 任选一种
brew install supabase/tap/supabase
# 或
npm install -g supabase
```

验证：

```bash
supabase --version
```

### A3. 启动本地栈并应用迁移

在仓库根目录：

```bash
cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind
npx supabase start
```

第一次会拉镜像，可能要几分钟。成功后终端会打印类似：

```text
API URL:  http://127.0.0.1:54321
anon key: eyJhbGciOi...   ← 复制这个
service_role key: eyJhbGciOi...  ← 仅服务端 / Edge，勿进前端
```

若数据库是空的，再执行一次：

```bash
npx supabase db reset
```

这会应用：

- `supabase/migrations/202609130001_init.sql`
- `supabase/migrations/202609130002_notes.sql`

并创建「注册 → 默认知识库」触发器。

### A4. 配置前端环境变量

```bash
cd refind-demo
cp .env.example .env
```

编辑 `.env`：

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<粘贴 supabase start 打印的 anon key>
```

### A5. 启动前端并验证

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

浏览器打开 http://127.0.0.1:5174/ ：

1. 用新邮箱注册 → 应直接进入应用（本地已关邮箱验证）。
2. 侧栏应有「默认知识库」。
3. 笔记 Tab 新建笔记 → 刷新后仍在。
4. 资料添加链接 / 文件 → 状态从「处理中」到 ready/失败（需本机 Edge 可用）。

部署本地 Edge Functions（解析 / 注销账户）：

```bash
cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind
npx supabase functions serve
```

另开终端再跑前端。`parse-material` / `account-delete` 依赖 serve 或已部署的 functions。

### A6. 常用命令

```bash
npx supabase status          # 查看 URL / keys
npx supabase stop            # 停止本地栈
npx supabase db reset        # 清空并重跑迁移（会丢本地数据）
```

---

## 路径 B：链接云端 Supabase（联调 / 演示）

适合：不想装 Docker，或要给别人演示。

### B1. 创建云端项目

1. 打开 https://supabase.com/dashboard ，登录。
2. **New project** → 选组织、项目名（如 `refind-dev`）、数据库密码（记下来）、区域。
3. 等项目变为 **Healthy**。

### B2. 把本地仓库链到云端

```bash
cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind
npx supabase login
npx supabase link --project-ref <Project Settings → General → Reference ID>
```

按提示输入数据库密码。

### B3. 推送迁移与（可选）Functions

```bash
npx supabase db push
npx supabase functions deploy parse-material
npx supabase functions deploy account-delete
```

在 Dashboard → **Edge Functions → Secrets** 配置（阶段二解析可用 stub，阶段三再配 AI）：

| Secret | 说明 |
| --- | --- |
| （自动）`SUPABASE_SERVICE_ROLE_KEY` | 一般由平台注入；若函数读不到再手动加 |
| 阶段三：`DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY` | 现在可不配 |

### B4. 取云端 URL / anon key 给前端

Dashboard → **Project Settings → API**：

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

`refind-demo/.env` 示例：

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**不要**把 `service_role` 写进 Vite 环境变量。

### B5. Auth 设置（对齐 Spec：注册免邮箱验证）

Dashboard → **Authentication → Providers → Email**：

- 关闭 **Confirm email**（或 “Enable email confirmations”）  
  与本地 `config.toml` 里 `enable_confirmations = false` 一致。

### B6. Storage

迁移里已声明私有 bucket `materials`。若 Dashboard 里没有，检查 `db push` 是否成功；或在 Storage 手动建 `materials`（Private），策略以迁移 SQL 为准。

---

## 验收清单（接上后端后）

| 检查项 | 预期 |
| --- | --- |
| 注册 | 有 `profiles` 行 + 一个「默认知识库」 |
| 双用户 | A 看不到 B 的知识库 / 笔记（RLS） |
| 上传 / 粘贴链接 | 出现 `processing` → `ready` / `failed` / `link_only`；公开网页可匿名解析；主流平台连接可选 |
| 笔记 | 刷新后仍在 |
| 「生成笔记」 | 提示下一阶段，不调 DeepSeek |
| 「添加至知识库」 | 提示 Phase 3，不假装同步成功 |
| 注销账户 | 确认后会话清掉，用户数据级联删除 |

---

## 常见问题

**Q: `supabase start` 报 Docker daemon？**  
A: 先打开 Docker Desktop，再重试。

**Q: 前端一直「正在恢复登录状态」？**  
A: 检查 `.env` 的 URL/anon key 是否和 `supabase status`（本地）或 Dashboard API（云端）一致；改完需重启 `npm run dev`。

**Q: 注册成功但提示查邮箱？**  
A: 云端仍开着 Confirm email；按 B5 关掉。

**Q: 解析一直失败？**  
A: 确认 `functions serve` / `functions deploy` 已跑；看函数日志。链接须是公网 http(s)，不能是内网地址。

**Q: node_modules 被 git 跟踪？**  
A: 历史仓库曾提交过 `refind-demo/node_modules`；日常开发勿再 `git add` 它们。新改动只提交源码与 lockfile。

---

## 文档索引

- 阶段二计划：`docs/superpowers/plans/2026-09-13-phase2-backend-foundation.md`
- 阶段三计划：`docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md`
- 路线图：`docs/superpowers/specs/2026-09-13-phase2-3-roadmap-design.md`
