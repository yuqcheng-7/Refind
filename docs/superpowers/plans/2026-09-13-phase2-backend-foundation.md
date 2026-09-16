# Phase 2: Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Supabase Auth + Postgres + Storage + Edge Functions, persist knowledge bases / materials / notebooks / notes / inspiration cards, and wire `refind-demo` to real APIs while keeping phase-1 UI behavior. **2026-09-14:** Task 8 补强文档/OCR/链接双路径（见文末）。**2026-09-15：** 设置页平台连接 A（演示态）+ 侧栏知识库常显/空状态已落地；真实登录 B 与托管解析归阶段三。

**Architecture:** Create a `supabase/` project sibling to `refind-demo`. Schema + RLS live in SQL migrations; auth and CRUD go through Supabase client from the React app; async link/file ingest runs in Edge Functions that update `materials.status`. Dev link prefetch may use local `tools/platform-parser`. Notes persist as `content jsonb` with `note_inspiration_cards` for materials; **no** DeepSeek generate / RAG / note↔KB sync in this phase. Current cloud project: Tokyo `ap-northeast-1`.

**Tech Stack:** Supabase (Auth, Postgres, Storage, Edge Functions), pgvector extension enabled but embeddings deferred, React 19 + Vite + `@supabase/supabase-js`, Vitest; parse hardening uses MediaCrawler（主流）+ Crawl4AI/Readability（其他网页）.

**Canonical design:** `docs/superpowers/specs/2026-09-13-phase2-3-roadmap-design.md`  
**Related specs:** `2026-09-14-platform-connection-settings-ui.md`、`2026-09-14-link-parse-pipeline-trial.md`、`2026-09-15-sidebar-kb-empty-states.md`  
**Data model / APIs:** `output/Refind拾藏开发Spec_V1.0.md` §3–§6、§12–§13

## Global Constraints

- All rows scoped by `user_id`; RLS must deny cross-user reads/writes.
- Default knowledge base named `默认知识库` created on signup (`knowledge_base_type=default`).
- Phase 2 does **not** ship real RAG, note AI generate, note↔KB sync, mindmaps, or production deploy.
- 「生成笔记」may stay UI-visible but must call a stub / remain disabled with clear copy until Phase 3.
- Preserve notes UX from notes-workspace-remediation: create fullscreen without materials; organize with materials; return → 我的笔记 + selection.
- Do not commit unless the user asks.
- Prefer Spec table/column names: `notebooks`, `notes`, `inspiration_cards`, `note_inspiration_cards`, `note_revisions`, `materials`, `material_chunks`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `supabase/config.toml` | Local Supabase project config |
| `supabase/migrations/202609130001_init.sql` | Core schema + RLS + Storage policies |
| `supabase/migrations/202609130002_notes.sql` | Notebooks / notes / cards / links / revisions |
| `supabase/functions/parse-material/index.ts` | Async link/file parse → status + body + chunks (no embeddings) |
| `supabase/functions/account-delete/index.ts` | Account deletion cascade |
| `refind-demo/src/lib/supabaseClient.js` | Browser Supabase client |
| `refind-demo/src/lib/api/` | Thin API modules: auth, bases, materials, notes, cards |
| `refind-demo/src/features/auth/` | Login / signup / forgot-password screens |
| `refind-demo/src/App.jsx` | Gate on session; replace demo stores with API-backed state |
| `refind-demo/.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `refind-demo/src/lib/api/*.test.js` | Unit tests for mappers / status helpers |

---

### Task 1: Supabase project scaffold + core schema + RLS

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202609130001_init.sql`
- Create: `refind-demo/.env.example`

**Interfaces:**
- Produces: tables `profiles`, `knowledge_bases`, `materials`, `material_tags`, `material_tag_relations`, `material_chunks`, `platform_connections`, `import_tasks`, `chat_conversations`, `chat_messages`, `message_citations` (empty-ready for Phase 3); Storage bucket `materials` (private); RLS policies `user_id = auth.uid()`

- [ ] **Step 1: Install CLI and init**

```bash
cd "/Users/zoecheng/Documents/ChatGPT/拾藏Refind"
npx supabase init
```

Expected: `supabase/config.toml` exists.

- [ ] **Step 2: Write migration `202609130001_init.sql`**

Include at minimum:

```sql
create extension if not exists "pgcrypto";
create extension if not exists "vector"; -- enable now; embeddings Phase 3

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('default', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index knowledge_bases_one_default_per_user
  on public.knowledge_bases (user_id) where type = 'default';

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_base_id uuid not null references public.knowledge_bases(id) on delete cascade,
  title text,
  source_url text,
  platform_code text not null default 'web',
  input_type text not null,
  status text not null check (status in ('processing','ready','link_only','failed','deleted')),
  summary text,
  storage_object_key text,
  body_text text,
  origin_type text not null default 'import' check (origin_type in ('import','note')),
  parse_fail_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- material_tags, material_tag_relations, material_chunks (embedding vector nullable),
-- platform_connections, import_tasks, chat_conversations, chat_messages, message_citations
-- follow Spec §3 column names exactly.
```

Enable RLS on every table:

```sql
alter table public.knowledge_bases enable row level security;
create policy kb_owner_all on public.knowledge_bases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- repeat pattern for all user-owned tables
```

Create private Storage bucket `materials` with policies: users may read/write only objects under `{user_id}/…`.

- [ ] **Step 3: Signup trigger — profile + default KB**

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.knowledge_bases (user_id, name, type)
  values (new.id, '默认知识库', 'default');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: Apply migration locally**

```bash
npx supabase start
npx supabase db reset
```

Expected: migrations apply; `supabase status` prints API URL + anon key.

- [ ] **Step 5: Add `.env.example`**

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=replace-with-local-anon-key
```

- [ ] **Step 6: Commit** (only if user requested)

---

### Task 2: Auth UI + session gate

**Files:**
- Create: `refind-demo/src/lib/supabaseClient.js`
- Create: `refind-demo/src/features/auth/AuthScreen.jsx`
- Create: `refind-demo/src/lib/api/auth.js`
- Create: `refind-demo/src/lib/api/auth.test.js`
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/package.json` (add `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Produces: `signUp({ email, password })`, `signIn({ email, password })`, `signOut()`, `resetPassword(email)`, `getSession()`

- [ ] **Step 1: Install client**

```bash
cd refind-demo && npm install @supabase/supabase-js
```

- [ ] **Step 2: Failing test — auth API shape**

```js
import { describe, expect, it } from 'vitest';
import { mapAuthError } from './auth.js';

describe('auth helpers', () => {
  it('maps invalid login to Chinese copy', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('邮箱或密码不正确');
  });
});
```

- [ ] **Step 3: Implement `supabaseClient.js` + `auth.js`**

```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

```js
export function mapAuthError(error) {
  if (!error) return null;
  if (/invalid login/i.test(error.message)) return '邮箱或密码不正确';
  if (/already registered/i.test(error.message)) return '该邮箱已注册';
  return '操作失败，请稍后重试';
}

export async function signUp({ email, password }) {
  return supabase.auth.signUp({ email, password });
}
export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}
```

- [ ] **Step 4: `AuthScreen` — email/password signup + login + forgot password**

No email verification required (Spec §4.1).

- [ ] **Step 5: Gate `App` on session**

If no session → render `AuthScreen`; else existing shell. Account menu「退出登录」calls `signOut()`.

- [ ] **Step 6: Run tests**

```bash
npm run test:ui -- src/lib/api/auth.test.js
```

Expected: PASS.

- [ ] **Step 7: Manual check** — signup creates `profiles` row + one `默认知识库`.

---

### Task 3: Knowledge base + materials CRUD (no parse yet)

**Files:**
- Create: `refind-demo/src/lib/api/knowledge.js`
- Create: `refind-demo/src/lib/api/materials.js`
- Modify: `refind-demo/src/App.jsx` (replace `demoKnowledgeBases` / material lists)

**Interfaces:**
- Produces:
  - `listKnowledgeBases(): Promise<KnowledgeBase[]>`
  - `createKnowledgeBase({ name, description? })`
  - `updateKnowledgeBase(id, patch)` / `deleteKnowledgeBase(id)` (block deleting `type=default`)
  - `listMaterials(knowledgeBaseId, { query?, platform? })`
  - `createMaterialStub({ knowledgeBaseId, inputType, sourceUrl?, title? })` → status `processing`

- [ ] **Step 1: Failing test — default KB cannot be deleted in mapper**

```js
it('rejects delete of default knowledge base', () => {
  expect(() => assertDeletable({ type: 'default' })).toThrow(/默认知识库/);
});
```

- [ ] **Step 2: Implement API modules with Supabase queries + Spec field mapping** (`type` ↔ UI).

- [ ] **Step 3: Wire sidebar KB list and materials panel to API; keep UI classes unchanged.

- [ ] **Step 4: Run** `npm run test:ui` for touched tests; manual: create custom KB, see materials empty state.

---

### Task 4: Storage upload + `parse-material` Edge Function

**Files:**
- Create: `supabase/functions/parse-material/index.ts`
- Create: `refind-demo/src/lib/api/ingest.js`
- Modify: `refind-demo/src/features/knowledge/MaterialIngest.jsx`

**Interfaces:**
- Consumes: material id, optional `storage_object_key` / `source_url`
- Produces: material transitions `processing → ready | failed | link_only`; writes `body_text`, `summary` (stub OK), `material_chunks` without embeddings

- [ ] **Step 1: Client upload path**

```js
export async function uploadMaterialFile(userId, file) {
  const key = `${userId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from('materials').upload(key, file);
  if (error) throw error;
  return key;
}
```

- [ ] **Step 2: Edge Function skeleton**

```ts
// supabase/functions/parse-material/index.ts
Deno.serve(async (req) => {
  const { materialId } = await req.json();
  // service-role client: load material
  // if source_url: fetch HTML / extract text (simple readability OK for Phase 2)
  // if storage_object_key: download + extract text by input_type
  // on success: status=ready, insert material_chunks (embedding null)
  // on failure: increment parse_fail_count; if >=3 → link_only else failed
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
```

Phase 2 summary/tags: deterministic stub string is acceptable; real DeepSeek can wait for Phase 3 Task 1.

- [ ] **Step 3: Wire MaterialIngest** — after creating stub material, invoke function; poll status until terminal.

- [ ] **Step 4: Verify failure ladder** — force fail thrice → `link_only`; UI keeps retry/delete (match prototype).

- [ ] **Step 5: Manual QA** — paste public URL + upload `.txt`/`.md`; both reach `ready`.

---

### Task 5: Notes schema + notes / notebooks / cards API

**Files:**
- Create: `supabase/migrations/202609130002_notes.sql`
- Create: `refind-demo/src/lib/api/notes.js`
- Create: `refind-demo/src/lib/api/notes.test.js`

**Interfaces:**
- Produces tables + RLS: `notebooks`, `notes`, `inspiration_cards`, `note_inspiration_cards`, `note_revisions`, `note_knowledge_base_materials` (table exists; sync unused until Phase 3)
- Produces API:
  - `listNotes({ notebookId?, query? })`
  - `createNote({ title?, notebookId? })`
  - `updateNote(id, { title?, content?, notebookId? })`
  - `deleteNote(id)`
  - `listNotebooks` / `createNotebook` / `renameNotebook` / `deleteNotebook({ strategy })`
  - `listInspirationCards({ query? })` / `createInspirationCard(payload)` / `deleteInspirationCard(id)`
  - `setNoteMaterials(noteId, { cardIdsOrdered, thoughtsByCardId })`

- [ ] **Step 1: Migration matching Spec §3**

```sql
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notebook_id uuid references public.notebooks(id) on delete set null,
  title text,
  content jsonb not null default '{"text":"","blocks":[],"sections":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_inspiration_cards (
  note_id uuid not null references public.notes(id) on delete cascade,
  inspiration_card_id uuid not null references public.inspiration_cards(id) on delete cascade,
  sort_order int not null default 0,
  user_thought text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, inspiration_card_id)
);
-- notebooks, inspiration_cards, note_revisions, note_knowledge_base_materials + RLS
```

- [ ] **Step 2: Failing test — content JSON shape**

```js
it('normalizes note content for API', () => {
  expect(normalizeNoteContent({ text: 'hi' })).toEqual({
    text: 'hi', blocks: [], sections: [],
  });
});
```

- [ ] **Step 3: Implement `notes.js` mappers** — map DB rows ↔ existing frontend note/card shapes (`contentSnapshot`, `questionSnapshot`, `inspirationCardIds`).

- [ ] **Step 4: `db reset` + API smoke** via supabase JS in a small node script or Vitest with mocked client.

---

### Task 6: Wire NotesWorkspace to real persistence

**Files:**
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/features/notes/NoteEditor.jsx`
- Modify: `refind-demo/src/features/notes/InspirationCards.jsx`
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx` (mock API)

**Interfaces:**
- Consumes: Task 5 APIs
- Produces: autosave debounce 1–2s calling `updateNote`; organize creates note + `setNoteMaterials`; 「生成笔记」disabled or stub notice「阶段三开放」

- [ ] **Step 1: Replace `demoNotes` / `demoCards` with loaders on mount.**

- [ ] **Step 2: Keep create / organize / fullscreen / return behavior**; only swap persistence.

- [ ] **Step 3: Disable real generate**

```js
const generate = () => {
  notice?.('AI 生成笔记将在下一阶段开放。');
};
```

Or keep local `generateNoteDocument` behind a `VITE_ALLOW_DEMO_GENERATE=true` flag for UX demos — default off against real backend.

- [ ] **Step 4: Update tests** to mock `listNotes` / `createNote`; run:

```bash
npm run test:ui -- src/features/notes
```

Expected: PASS.

- [ ] **Step 5: Manual** — create note, refresh page, note still present; organize cards → materials persist.

---

### Task 7: Account delete + Phase 2 verification

**Files:**
- Create: `supabase/functions/account-delete/index.ts`
- Modify: account settings UI (or account menu) to call delete with confirm

- [ ] **Step 1: Edge Function** using service role: delete Storage objects under `user_id/`, then `auth.admin.deleteUser` (cascades profiles/KBs/notes via FK).

- [ ] **Step 2: RLS isolation test** — two local users; user B cannot `select` user A materials/notes.

- [ ] **Step 3: Phase 2 acceptance checklist**

| Check | Pass? |
| --- | --- |
| Signup → 默认知识库 | |
| Link + file ingest → ready / fail / link_only | |
| Notes + cards survive refresh | |
| Create fullscreen no materials; organize with materials | |
| Cross-user RLS denied | |
| Generate note not calling DeepSeek | |

- [ ] **Step 4: Append results to `refind-demo/design-qa.md` under「Phase 2 foundation」.**

---

### Task 8: Parse hardening（2026-09-14 产品确认）

> 对齐 Spec §12 / PRD §9.9 / 路线图 §2–§3。在 Task 4 stub 之上按顺序补强，不改变 `processing → ready | failed | link_only` 状态机。

**Files:**
- Modify: `supabase/functions/parse-material/index.ts`
- Modify / Create: `supabase/functions/parse-material/extractDocumentText.js`（及 OCR / 网页抽取模块）
- Modify: `refind-demo/src/lib/api/ingest.js`（Storage key = `userId/uuid.ext`）
- Optional service: MediaCrawler 外置进程或 HTTP 适配；Crawl4AI / Readability 调用封装

#### 8A. 文档文本提取 — **已完成**

- [x] PDF / DOCX / PPTX / XLSX 文本提取并写入 `body_text` / chunks
- [x] 静态 npm 依赖部署（避免 Deno 动态 import 约束失败）
- [x] Storage key 不含原始中文/`+` 文件名

#### 8B. 图片 OCR — **待做**

- [x] **Step 1:** 选定 OCR 提供方（云端 API 可接受）；密钥仅存 Edge secrets — **百炼 Qwen VL / OCR（`DASHSCOPE_API_KEY`）**
- [x] **Step 2:** `input_type=image` 下载 Storage 对象 → OCR 文字 + 简短视觉描述 → `ready`；失败计入 `parse_attempt_count`
- [ ] **Step 3:** 手工验证中英文截图各一张进入 `ready` 并可被关键词搜到（Phase 3 前可仅 body 可搜）

#### 8C. 链接双路径加强 — **待做**

- [ ] **Step 1: 分流** — 按 `platform_code`：`xhs|douyin|zhihu|bilibili|wechat_mp` → 路径 A；其余 → 路径 B
- [ ] **Step 2: 路径 B（其他网页）** — 匿名抽取（Crawl4AI / Readability）；强 SPA 可 Playwright **匿名**渲染；**禁止**要求用户注册目标站
- [ ] **Step 3: 路径 A（主流平台）** — 接入 MediaCrawler；有平台会话则带会话；无会话仍尝试公开可达解析，或提示连接 / 「仅保存链接」
- [ ] **Step 4: 抖音/B 站（方案 A）** — MediaCrawler 产出：
  - `playback_mode` + embed/临时可播 URL（**不**上传视频到 Storage）
  - `content_text` = 文案/简介 + 已有字幕
  - `summary` = 基于 `content_text` 的 AI 摘要（Phase 2 可 stub，Phase 3 接 DeepSeek）
  - 无 ASR、无评论；预览窗点击播放
- [ ] **Step 5: UX** — 乐观 `processing` 行；无默认 `#待整理`；类型标签按平台/文件类型；列表可滚且隐藏滚动条；视频预览 = 播放器 + 摘要 + 正文
- [ ] **Step 6: 验收** — 公开博客 URL → `ready`；需登录墙的长尾站 → 可 `link_only`；主流平台未连接仍可保存链接；抖音/B 站有文案时可 `ready` 且预览能播或降级「在原站打开」

---

## Plan Self-Review

- Roadmap §3.1 items 1–7 each map to Tasks 1–6; verification = Task 7; parse hardening = Task 8.
- Explicit non-goals (RAG, generate, sync, deploy, ASR, 长尾站强制注册) not scheduled.
- Spec table names used (`note_inspiration_cards`, not demo-only names).
- Embeddings enabled as extension only; no Phase 3 indexing required here.
- Link architecture: MediaCrawler（主流）+ Crawl4AI/Readability（其他网页）已写入 Spec §12。
