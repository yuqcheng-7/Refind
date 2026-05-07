# Refind (MVP)

## DeepSeek（OpenAI 兼容）

- `base_url`: `https://api.deepseek.com`
- `model`:
  - 更快更省：`deepseek-v4-flash`
  - 更高质量：`deepseek-v4-pro`

说明：文档里提到的 `deepseek-chat / deepseek-reasoner` 是旧别名（将弃用），直接使用上面的新模型名即可。

## 技术栈（已定）

- **前端**：Next.js + Tailwind
- **后端**：Supabase（Auth + Postgres + Storage + Edge Functions）
- **部署**：Vercel（前端）+ Supabase（后端）

## Supabase 配置（从 0 到可跑）

### 1) 创建 Supabase Project

在 Supabase 新建项目，然后开启 **Auth → Email**（邮箱/密码）。

### 2) 配置前端环境变量

复制 `web/.env.local.example` 为 `web/.env.local`，填写：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3) 运行前端

```bash
cd web
npm install
npm run dev
```

> Edge Functions / 数据库表结构 / RLS 将在 `supabase/` 目录下维护（后续开工补齐）。

