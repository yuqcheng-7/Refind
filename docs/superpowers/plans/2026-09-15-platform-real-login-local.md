# 平台真实连接（B · 本机）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo platform connect for 小红书 + 抖音 with local Playwright login; store session locally + in `platform_connections`; parse via `use_saved_session`.

**Architecture:** Extend `tools/platform-parser` with `/login` + `/logout` and per-platform session files. Settings page polls login status, then upserts Supabase without demo markers. Parse already sends `use_saved_session`; parser prefers `sessions/{platform}.json`.

**Tech Stack:** Python 3 + Playwright (headed), existing ThreadingHTTPServer parser, React settings + `platformConnections.js`, Vitest.

## Global Constraints

- Only `xhs` and `douyin` support real login; others disabled with「即将支持」.
- Parser binds `127.0.0.1` only.
- List APIs never return `encrypted_session`.
- Session encoding: `dev1:` + base64(utf8 JSON).
- Do not commit unless the user asks.
- Spec: `docs/superpowers/specs/2026-09-15-platform-real-login-local-design.md`

---

### Task 1: Session store + encode helpers (parser + FE)

**Files:**
- Create: `tools/platform-parser/session_store.py`
- Create: `tools/platform-parser/test_session_store.py`
- Create: `refind-demo/src/lib/api/platformSession.js`
- Create: `refind-demo/src/lib/api/platformSession.test.js`
- Modify: `tools/platform-parser/.gitignore` or root `.gitignore` for `sessions/`

**Interfaces:**
- Produces (Python): `save_platform_session(platform, payload: dict) -> Path`, `load_platform_session(platform) -> dict | None`, `clear_platform_session(platform) -> None`, `cookie_header_from_session(payload) -> str`
- Produces (JS): `encodeDevSession(payload) -> string`, `decodeDevSession(encoded) -> object | null`, `REAL_LOGIN_PLATFORMS = ['xhs','douyin']`

- [x] **Step 1: Write failing Python test** for save/load/clear and cookie header join
- [x] **Step 2: Implement `session_store.py`** under `tools/platform-parser/sessions/`
- [x] **Step 3: Write failing Vitest** for `dev1:` encode/decode
- [x] **Step 4: Implement `platformSession.js`**
- [x] **Step 5: Run** `python3 -m pytest tools/platform-parser/test_session_store.py -q` and `npx vitest run src/lib/api/platformSession.test.js`

---

### Task 2: Parser login API (Playwright)

**Files:**
- Create: `tools/platform-parser/login_flow.py`
- Create: `tools/platform-parser/test_login_api.py` (mock Playwright / in-memory job store)
- Modify: `tools/platform-parser/server.py`
- Create: `tools/platform-parser/requirements.txt` (`playwright`)
- Modify: `tools/platform-parser/cookies.txt.example` or README note for Playwright install

**Interfaces:**
- Produces: `POST /login` → `{ login_id }`; `GET /login/:id` → status object; `POST /logout` → `{ ok: true }`
- Login success writes `session_store` and returns `session_payload` JSON string once

- [x] **Step 1: Job store + status machine tests** (pending → success/failed/expired) without real browser
- [x] **Step 2: Implement login_flow** with injectable browser runner
- [x] **Step 3: Wire HTTP routes** in `server.py`
- [x] **Step 4: Update `/parse`** to prefer per-platform session cookies when `use_saved_session`
- [x] **Step 5: Document** `pip install playwright && playwright install chromium`

---

### Task 3: Frontend connect API + Settings UI

**Files:**
- Modify: `refind-demo/src/lib/api/platformConnections.js`
- Create: `refind-demo/src/lib/api/platformLogin.js`
- Create: `refind-demo/src/lib/api/platformLogin.test.js`
- Modify: `refind-demo/src/features/settings/SettingsPage.jsx`
- Modify: `refind-demo/src/features/settings/SettingsPage.test.jsx`

**Interfaces:**
- `connectPlatform(code, { sessionPayload, accountDisplayName })` requires real payload for xhs/douyin
- `startPlatformLogin(platform)` / `pollPlatformLogin(loginId)` hit parser URL
- Settings: real login poll for xhs/douyin; other platforms disabled「即将支持」; disconnect calls parser `/logout`

- [x] **Step 1: Failing tests** for encode upsert args and login client URL building
- [x] **Step 2: Implement API clients**
- [x] **Step 3: Wire SettingsPage** copy + busy/polling UX
- [x] **Step 4: Update SettingsPage tests**
- [x] **Step 5: Run** `npx vitest run src/lib/api/platformSession.test.js src/lib/api/platformLogin.test.js src/features/settings/SettingsPage.test.jsx`

---

### Task 4: Docs sync

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-platform-connection-settings-ui.md`
- Modify: `docs/superpowers/specs/2026-09-13-phase2-3-roadmap-design.md` (§1.1 status)
- Modify: `docs/superpowers/specs/2026-09-15-platform-real-login-local-design.md` (status → 实现中/已落地)

- [x] **Step 1: Update status tables** for B local slice
- [x] **Step 2: Note Playwright install** in link-parse or platform spec

---

## Plan Self-Review

- Spec §3–§5 covered by Tasks 1–3; §8 acceptance needs manual QR (document in Task 2 README).
- No MediaCrawler scope creep.
- Commits deferred to user request.
