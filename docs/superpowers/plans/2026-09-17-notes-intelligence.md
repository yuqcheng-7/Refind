# Notes Intelligence + Rich Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship TipTap note editor (CN + Apple/Windows), harden inspiration capture, `generate-note`, and `sync-note` — then stop before production launch.

**Architecture:** Replace fragile `contentEditable`/`execCommand` with TipTap (bundled via Vite). Persist through existing `notes.content` jsonb. Edge Functions `generate-note` / `sync-note` orchestrate DeepSeek and KB materials. Order **D → A → B → C**.

**Tech Stack:** React 19 + Vite, TipTap (+ StarterKit, underline, color, highlight, text-align, link, placeholder), Supabase Postgres/RLS, Edge Functions (Deno), DeepSeek Chat.

**Canonical design:** `docs/superpowers/specs/2026-09-17-notes-intelligence-design.md`

## Global Constraints

- No Google Fonts / foreign CDN / SaaS editors; TipTap deps npm-bundled only
- Typography tokens exactly as design §4.3–4.4 (desktop / iPad / mobile)
- Only 6 paragraph styles; paste → 正文（默认）
- Font stack: `'Refind Source Han SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
- Do not change RAG main pipeline
- Do not commit unless user asks; no launch/hosting in this plan
- TDD where noted; verify before claiming done

---

## File map

| File | Responsibility |
| --- | --- |
| `refind-demo/package.json` | Add TipTap packages |
| `refind-demo/src/features/notes/editor/*` | TipTap schema, toolbar, style tokens, serialize/deserialize |
| `refind-demo/src/features/notes/NoteEditor.jsx` | Mount TipTap; wire save / generate / materials |
| `refind-demo/src/styles/notes.css` | Typography + toolbar CSS (replace execCommand assumptions) |
| `refind-demo/src/lib/api/notes.js` | `generateNote`, `syncNote` client; content normalize |
| `refind-demo/src/App.jsx` / `AnswerActions.jsx` | Ensure card payloads complete |
| `supabase/functions/generate-note/index.ts` | AI generate + revision |
| `supabase/functions/sync-note/index.ts` | Multi-KB sync + fan-out hooks |
| `*_test.*` | Unit / component tests per task |

---

### Task 1: TipTap scaffold + typography tokens (D · foundation)

**Files:**
- Modify: `refind-demo/package.json`
- Create: `refind-demo/src/features/notes/editor/noteTypography.css` (or section in `notes.css`)
- Create: `refind-demo/src/features/notes/editor/noteSchema.js`
- Create: `refind-demo/src/features/notes/editor/NoteRichEditor.jsx`
- Create: `refind-demo/src/features/notes/editor/noteTypography.test.js` (token / class map assertions)

- [ ] **Step 1: Install** `@tiptap/react` `@tiptap/starter-kit` `@tiptap/extension-underline` `@tiptap/extension-text-style` `@tiptap/extension-color` `@tiptap/extension-highlight` `@tiptap/extension-text-align` `@tiptap/extension-link` `@tiptap/extension-placeholder` (pin compatible versions)

- [ ] **Step 2: Failing test** — map style id → CSS class / attrs for `h1|h2|h3|body1|body2|body3` with exact px from design

- [ ] **Step 3: Implement CSS variables** for desktop tokens + `@media` iPad/mobile tables from design §4.4

- [ ] **Step 4: Minimal `NoteRichEditor`** — StarterKit + custom paragraph class for body1/2/3; headings; default body1; font-family stack

- [ ] **Step 5: Run** `npm test` (or vitest filter for typography) — pass

- [ ] **Step 6: Commit** (only if user asked)

---

### Task 2: Toolbar UX (D · tools)

**Files:**
- Create: `refind-demo/src/features/notes/editor/NoteEditorToolbar.jsx`
- Modify: `NoteRichEditor.jsx`, `notes.css`
- Create/Modify: toolbar component test

- [ ] **Step 1: Failing test** — style menu options labels exactly: `标题1` `标题2` `标题3` `正文（默认）` `辅助正文` `小字备注`

- [ ] **Step 2: Implement toolbar** — undo/redo, style select, bold/italic/underline/strike, color + highlight pickers (closed palette), align L/C/R, lists, blockquote, link prompt

- [ ] **Step 3: Active-state** reflects selection (isActive)

- [ ] **Step 4: Manual smoke** — Win or Mac browser: apply each style; IME type Chinese mid-edit

- [ ] **Step 5: Commit** (if asked)

---

### Task 3: Persist TipTap ↔ `notes.content` + paste normalize (D · storage)

**Files:**
- Create: `refind-demo/src/features/notes/editor/noteContentCodec.js` (+test)
- Modify: `NoteEditor.jsx` to use `NoteRichEditor` instead of raw contentEditable
- Modify: `normalizeNoteContent` in `notes.js` if needed

- [ ] **Step 1: Failing tests** — serialize sample doc → jsonb → deserialize equal; paste HTML with `<span style="font-size:19px">` becomes body1

- [ ] **Step 2: Implement codec** — store `{ text, html, sections? }`; keep backward compat reading old `text`/`blocks`/`sections`

- [ ] **Step 3: Wire autosave** — onUpdate debounce same 1–2s path as today; undo stack via TipTap history (remove broken execCommand undo if duplicate)

- [ ] **Step 4: Migrate NoteEditor** — remove `document.execCommand` toolbar; citation `[n]` nodes still render (may be marks or widgets; preserve hover dialog)

- [ ] **Step 5: Run tests** — pass

- [ ] **Step 6: Commit** (if asked)

---

### Task 4: Inspiration capture harden (A)

**Files:**
- Modify: `AnswerActions.jsx`, `App.jsx` `saveAnswerCard`
- Modify: `notes.js` if snapshot shape incomplete
- Tests: AnswerActions / App save path

- [ ] **Step 1: Audit payload** — fragment + whole answer include `answerMode`, `citationSnapshot`, message/conversation ids, question snapshot

- [ ] **Step 2: Failing test** — RAG save includes citation snapshot array; general has empty/no fake material ids

- [ ] **Step 3: Fix gaps** — ensure list refresh after save; 灵感页 shows new card

- [ ] **Step 4: Manual** — save → hard refresh → card present

- [ ] **Step 5: Commit** (if asked)

---

### Task 5: `generate-note` Edge + client (B)

**Files:**
- Create: `supabase/functions/generate-note/index.ts` (+ shared helpers if needed)
- Modify: `notes.js` `generateNote(noteId)`
- Modify: `NotesWorkspace.jsx` / `NoteEditor.jsx` — replace stub notice
- Tests: generate mapper / disabled when no materials

- [ ] **Step 1: Failing test** — client disabled when `inspirationCardIds` empty; enabled when non-empty

- [ ] **Step 2: Edge Function** — auth, load note+cards+thoughts, insert `note_revisions`, DeepSeek JSON → sections, update note

- [ ] **Step 3: Client UX** — 生成中 / error retry / reload content into TipTap; keep materials panel

- [ ] **Step 4: Preserve citation UX** — `[n]` hover + CardDetailDialog + viewport clamp

- [ ] **Step 5: Deploy** `generate-note` to Tokyo project when ready for QA

- [ ] **Step 6: Commit** (if asked)

---

### Task 6: `sync-note` Edge + bidirectional rules (C)

**Files:**
- Create: `supabase/functions/sync-note/index.ts`
- Modify: `KnowledgeBaseSyncDialog` / `NotesWorkspace` sync handlers
- Modify: material update path for `origin_type=note` fan-in (parse-material or dedicated hook)
- Tests: sync mapping / delete rules unit where pure

- [ ] **Step 1: Edge upsert** materials + `note_knowledge_base_materials`; trigger embed for synced materials

- [ ] **Step 2: Note PATCH fan-out** — on note save, push title/body to linked materials (async ok)

- [ ] **Step 3: Material edit fan-in** — if `origin_type=note`, update note then other links

- [ ] **Step 4: Deletes** — note delete cascades synced materials; material/KB delete unlinks only

- [ ] **Step 5: UI** — non-blocking notice 同步中/已同步/失败

- [ ] **Step 6: Manual matrix** from phase3 plan Task 5

- [ ] **Step 7: Commit** (if asked)

---

### Task 7: Docs sync + branch QA gate

**Files:**
- Modify: PRD / Spec / roadmap / `phase3-ai-rag-launch.md` status checkboxes for Tasks 3–5 + D done
- Modify: design-qa notes if present

- [ ] **Step 1: Update docs** to as-built
- [ ] **Step 2: Checklist** design §8 all checked on Win + Mac (+ mobile width)
- [ ] **Step 3: Stop** — do **not** start launch hosting unless new plan

---

## Execution handoff

Implement Tasks **1→7 in order**. After Task 3, editor should feel like a normal doc on Apple and Windows before any generate work.

**Next after this plan:** production launch plan (hosted parser, domain) — out of scope here.
