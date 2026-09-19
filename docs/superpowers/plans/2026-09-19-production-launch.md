# Production Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Refind V1.0 for invitee / domestic soft-launch: static frontend on a custom domain, cloud Supabase (Tokyo), and a clear path to hosted parser (no localhost `8787` dependency for end users).

**Architecture:** Frontend = Vite SPA (`refind-demo/dist/client`) on Vercel or Cloudflare Pages behind a **custom domain**. Data/AI = existing Supabase project `ap-northeast-1` + Edge Functions. Link prefetch / platform login B = hosted `platform-parser` (separate Task). Soft-launch may ship with parser deferred if product accepts “anonymous web + upload first”.

**Tech Stack:** Vite 6, React 19, Supabase (Auth/Postgres/Storage/Edge), Vercel or Cloudflare Pages, optional Cloudflare DNS proxy.

**Depends on:** Notes intelligence as-built (2026-09-18); Auth brand (2026-09-19); Spec §13.2–13.3; Phase 3 plan Task 7.

**Canonical refs:** `output/Refind拾藏开发Spec_V1.0.md` §13 / §15.5; `docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md` Task 7.

## Global Constraints

- **Must** use custom domain for domestic users; do not rely on `*.vercel.app` alone.
- Never expose `service_role` / `DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY` as `VITE_*`.
- Production `VITE_PLATFORM_PARSER_URL` must not point at `127.0.0.1`.
- Soft-launch OK without hosted parser only if marketing copy does not claim “连接账号解析登录墙”.
- Mindmap (Phase 3 Task 6) remains optional and out of this launch plan.

---

## File map

| File | Role |
| --- | --- |
| `refind-demo/vercel.json` | SPA rewrites + `dist/client` output for Vercel |
| `refind-demo/public/_redirects` | Cloudflare Pages SPA fallback |
| `refind-demo/package.json` | `build:web` = Vite-only static build |
| `refind-demo/.env.example` | Production env checklist |
| `refind-demo/design-qa.md` | Launch QA record (later task) |
| `output/design.md` / PRD / Spec | Mark launch status when live |

---

### Task 1: Frontend deploy scaffolding + build gate

**Files:**
- Create: `refind-demo/vercel.json`
- Create: `refind-demo/public/_redirects`
- Modify: `refind-demo/package.json` (`build:web`)
- Modify: `refind-demo/.env.example`

- [x] **Step 1: Confirm `npm run build` succeeds** (Vite + Sites prepare).

- [x] **Step 2: Add `build:web`** — `vite build` only, for Vercel/CF Pages (Sites worker artifacts not required).

- [x] **Step 3: Add SPA host config** — Vercel rewrites + CF `_redirects`.

- [x] **Step 4: Document production `VITE_*`** in `.env.example`.

- [x] **Step 5: Owner input required** — Host = Cloudflare Pages；域名 = `refind.cloud`（建议 `app.refind.cloud`）；解析默认 Soft A。NS 已在阿里云改为 Cloudflare，域名 **Active**。

- [ ] **Step 6: Deploy preview** — Cloudflare Pages 连接 GitHub；Root `refind-demo`；`npm run build:web`；输出 `dist/client`；设置 `VITE_SUPABASE_*`。

- [ ] **Step 7: Bind custom domain** — DNS CNAME/A per host docs; optional Cloudflare orange-cloud proxy.

- [ ] **Step 8: Supabase Auth URLs** — Dashboard → Authentication → URL Configuration:
  - Site URL = `https://<custom-domain>`
  - Redirect allow list includes `https://<custom-domain>/**` and password-reset path if used

**Done when:** Preview URL builds from `main`; custom domain resolves HTTPS; login page loads; anonymous key talks to Tokyo project.

---

### Task 2: Supabase production readiness checklist

**Files:** ops notes only (Dashboard / CLI); no app code unless CORS/auth URL gaps found.

- [ ] **Step 1: Confirm Tokyo project** — `ap-northeast-1`; migrations applied.

- [ ] **Step 2: Edge secrets present** — `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`; optional `OFFICE_CONVERT_URL` / `OFFICE_CONVERT_ENGINE`.

- [ ] **Step 3: Redeploy functions** used in V1 — at least: ingest/parse, chat-message, generate-note, sync-note, account-delete, embed paths as currently named in `supabase/functions/`.

- [ ] **Step 4: Storage bucket `materials` private + RLS smoke.**

**Done when:** Register → default KB → upload txt/md → ready; home general ask returns.

---

### Task 3: Soft-launch policy for parser (decide + implement)

**Two options (pick one before public invite):**

| Option | Behavior | When |
| --- | --- | --- |
| **A · Soft** | Ship without hosted parser; link save + anonymous path; settings “连接” copy says 即将支持 / 开发机 only | Fastest invitee launch |
| **B · Full** | Deploy `tools/platform-parser` on CN-reachable host; set `VITE_PLATFORM_PARSER_URL`; platform login B usable | Before claiming 平台连接 |

- [ ] **Step 1: Product picks A or B.**

- [ ] **Step 2a (if A):** Soften Settings platform copy for production; keep `VITE_PLATFORM_PARSER_URL` empty in prod.

- [ ] **Step 2b (if B):** Host parser (Fly/Railway/CVM HK); TLS; wire env; E2E 小红书/抖音 connect.

**Done when:** Invite copy matches actual parse capability.

---

### Task 4: Hosted Office→PDF (can follow soft-launch)

- [ ] Deploy `tools/office-convert` (Gotenberg) publicly.
- [ ] `supabase secrets set OFFICE_CONVERT_URL=… OFFICE_CONVERT_ENGINE=gotenberg`
- [ ] Re-parse sample PPTX/XLSX → `preview_storage_object_key` set.

---

### Task 5: E2E launch QA + doc sync

| Path | Pass? |
| --- | --- |
| Register → default KB | |
| Login lands on home hero | |
| Sidebar KB search without entering KB page | |
| Upload file → ready (+ embed) | |
| Home general ask | |
| Home RAG + citations | |
| KB AI RAG | |
| Inspiration card → generate note | |
| Sync note to KB | |
| Sign out keeps cloud data | |
| Second user isolation | |
| Domestic network opens custom domain | |
| Platform connect (only if Task 3 = B) | |

- [ ] Record results in `refind-demo/design-qa.md`.
- [ ] Update PRD §9.x / Spec §15 / `design.md` §10 with “soft-launch live” + URL.
- [ ] Mark Phase 3 Task 7 steps complete in `2026-09-13-phase3-ai-rag-launch.md`.

---

## Immediate next human decisions

1. **Host:** Cloudflare Pages（不用 Vercel）— **已确认**
2. **Domain:** `refind.cloud`（阿里云已购）— **已确认**
   - 建议应用主机名：`https://app.refind.cloud`（裸域 `refind.cloud` 可留给以后官网）
3. **Parser:** 默认 **A · Soft**（先上线，平台连接稍后）— 若不同意再说

Agent continues Task 1 Steps 2–4 in-repo without waiting; Steps 5–8 need answers above.
