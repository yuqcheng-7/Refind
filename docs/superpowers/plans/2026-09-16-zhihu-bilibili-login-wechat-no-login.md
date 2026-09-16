# 知乎 / B 站登录 + 微信无需登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable real local Playwright login for 知乎 + B 站 (same as 小红书); show 微信公众号 as「无需登录」without real login.

**Architecture:** Extend existing `SUPPORTED_LOGIN_PLATFORMS` / `REAL_LOGIN_PLATFORMS` / `login_flow` maps; Settings UI branches wechat to no-login; zhihu parse error copy points to Settings.

**Tech Stack:** Python platform-parser + Playwright, React Settings, Vitest / unittest.

## Global Constraints

- Real login only: `xhs`, `douyin`, `zhihu`, `bilibili`.
- `wechat_mp`: UI「无需登录」; no Playwright login; anonymous parse unchanged.
- Spec: `docs/superpowers/specs/2026-09-16-zhihu-bilibili-login-wechat-no-login-design.md`
- Do not commit unless the user asks.

---

### Task 1: Parser session + login_flow for zhihu/bilibili

**Files:** `session_store.py`, `login_flow.py`, `server.py`, `test_session_store.py`, `test_login_flow.py`

- [x] Expand `SUPPORTED_LOGIN_PLATFORMS` + `COOKIE_DOMAINS`
- [x] Add LOGIN_URLS / SUCCESS_COOKIE_KEYS / PROFILE_BOOTSTRAP + ready/nickname hooks
- [x] `SESSION_PLATFORMS` += bilibili; zhihu error → 设置页连接
- [x] Update unit tests (start_login accepts zhihu; rejects wechat_mp)

### Task 2: Frontend REAL_LOGIN + Settings wechat「无需登录」

**Files:** `platformSession.js`, tests, `SettingsPage.jsx`, `SettingsPage.test.jsx`

- [x] `REAL_LOGIN_PLATFORMS` += zhihu, bilibili
- [x] Settings hint + wechat no-login branch
- [x] Vitest green

### Task 3: Docs touch-up

- [x] Mark design spec status 实现中/已落地; brief README note if needed
