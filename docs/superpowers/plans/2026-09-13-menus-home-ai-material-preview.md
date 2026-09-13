# Menus, Home AI Separation & Material Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dismissible menus and ingest toolbar restore; keep homepage AI conversations on the home canvas; add material hover previews and in-app preview windows; ship homepage chat shell + answer share bubble selection.

**Architecture:** Add a shared `useDismissable` helper for outside-click/Esc. Split `homeMessages` and `kbMessages` in `App.jsx` with a home conversation layout that collapses the welcome hero. Extend material demo data with preview fields and a lightweight `/material/:id` (or hash-routed) preview page opened via `window.open`. Homepage share mode swaps composer for `HomeShareBar` and portals answer menus via `FloatingMenu`.

**Tech Stack:** React 19, Vite, lucide-react, Vitest, Testing Library, CSS.

## Global Constraints

- Prototype only for local demo data; link/file preview bodies use parsed content fields (`summary`, `body`) in the in-app preview window.
- Homepage send must not navigate to 知识库.
- Link materials open in-app preview first; provide secondary “在原站打开”.
- Preserve notes, navigation responsive behavior, and Task 7 ingest/RAG scope semantics.
- Do not commit unless the user asks.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `refind-demo/src/hooks/useDismissable.js` | Outside pointerdown + Esc close helper |
| `refind-demo/src/components/FloatingMenu.jsx` | Portal + fixed positioning for top-layer menus |
| `refind-demo/src/features/home/HomeConversation.jsx` | Home thread + share bubble selection + `HomeShareBar` |
| `refind-demo/src/features/home/HomeHistoryCard.jsx` | Floating history card / FAB |
| `refind-demo/src/features/home/HomeComposer.jsx` | Homepage composer (`DS快速`/`DS深度`, `#` tags) |
| `refind-demo/src/features/knowledge/AnswerActions.jsx` | Copy → bookmark → share → more |
| `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx` | Standalone preview window content |
| `refind-demo/src/features/knowledge/materialDemo.js` | Demo materials with kind/url/summary/body |
| `refind-demo/src/App.jsx` | Surface state, share mode, split message stores |
| `refind-demo/src/features/knowledge/MaterialIngest.jsx` | Auto-remove ready queue cards; restore tools row |
| `refind-demo/src/styles.css` | Home conversation, share, history, preview styles |
| Focused tests under `features/home` and `features/knowledge` | Interaction coverage |

## Task 1: Shared dismissable menus + ingest restore

**Files:**
- Create: `refind-demo/src/hooks/useDismissable.js`
- Modify: `App.jsx`, `HomeComposer.jsx`, `MaterialIngest.jsx`, notes filter menus as needed
- Create/modify: focused tests

- [x] **Step 1: Write failing tests**

Cover: open filter/account/ingest/home scope menus then pointerdown outside closes them; Esc closes; MaterialIngest ready card disappears and 添加资料 returns to tools row with search/filter.

- [x] **Step 2: Implement `useDismissable` and wire menus**

- [x] **Step 3: Auto-clear ready ingest cards; keep failed/downgraded until user acts**

- [x] **Step 4: Run** `npm run test:ui -- src/features/home src/features/knowledge`

## Task 2: Separate homepage AI from knowledge-base AI

**Files:**
- Create: `HomeConversation.jsx`
- Modify: `App.jsx`, `HomeComposer.jsx`, `styles.css`
- Tests: home conversation stays on home; KB panel uses `kbMessages` only

- [x] **Step 1: Write failing tests for no navigation to 知识库 on home submit**

- [x] **Step 2: Split `homeMessages` / `kbMessages` and scope reset rules**

- [x] **Step 3: Collapse welcome hero and render home conversation stream + composer styles**

- [x] **Step 4: Run focused + NotesWorkspace regression tests**

## Task 3: Material hover preview + preview window

**Files:**
- Create: `materialDemo.js`, `MaterialPreviewPage.jsx`
- Modify: `App.jsx`, `styles.css`, entry routing if needed for preview window
- Tests: hover content; click opens preview; link shows 在原站打开

- [x] **Step 1: Extend demo materials with `kind`, `url`, `fileName`, `summary`, `body`**

- [x] **Step 2: Hover card on material row**

- [x] **Step 3: Click opens `window.open` preview route; link secondary opens original URL**

- [x] **Step 4: Run** `npm run test:ui && npm run build`

## Task 4: Docs/QA sync

- [x] **Step 1: Append QA notes to `refind-demo/design-qa.md`**

- [x] **Step 2: Confirm PRD / Spec / design.md amendment sections still match shipped behavior**

## Task 5: Homepage chat shell + answer share selection

**Files:**
- Create/modify: `HomeHistoryCard.jsx`, `HomeConversation.jsx`, `AnswerActions.jsx`, `FloatingMenu.jsx`, `App.jsx`, `styles.css`, tests
- Docs: PRD §9 / Spec §11 / `design.md` §10 / amendments design

- [x] **Step 1: `homeSurface` hero/chat; brand / 首页 / 新增会话 rules; floating history card**

- [x] **Step 2: Composer polish — `DS快速`/`DS深度`, `#` tags, Enter send, black circular send**

- [x] **Step 3: AnswerActions order copy → bookmark → share → more; portal menus above all layers**

- [x] **Step 4: Share mode — selectable bubbles, replace composer with 复制对话链接 + 取消; exit after successful copy**

- [x] **Step 5: Flat charcoal selection checks; theme-aligned share bar; sync docs**

- [x] **Step 6: Run** `npm run test:ui`

---

## Plan Self-Review

- Spec coverage: menus, ingest restore, home/KB split, hover, preview window, chat shell, share selection all mapped.
- Preview window shows parsed title, summary, and body; links also offer「在原站打开」.
- Share copy success must return to normal conversation composer automatically.
- Depends on completed Task 7–8 homepage scope + MaterialIngest foundations.
