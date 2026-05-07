# Supabase (Refind MVP)

本目录用于维护：

- 数据库表结构与 RLS（`migrations/`）
- Edge Functions（`functions/`）

## 需要你在 Supabase 控制台做的配置

- **Auth → Providers**：启用 Email（邮箱/密码）
- **Edge Function Secrets**：
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_BASE_URL` = `https://api.deepseek.com`
  - `DEEPSEEK_MODEL` = `deepseek-v4-flash`

## 本地开发（可选）

如果你要用 Supabase CLI 本地跑数据库/函数：

```bash
supabase init
supabase start
supabase db reset
supabase functions serve
```

