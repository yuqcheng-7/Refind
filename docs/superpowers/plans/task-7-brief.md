# Task 7 Brief: Homepage AI scope + knowledge-base material ingest

**Plan:** `docs/superpowers/plans/2026-09-12-refind-notes-inspiration-prototype.md` (Task 7)

**Workdir:** `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo`

## Requirements (verbatim intent)

1. **Homepage composer (`HomeComposer.jsx`)**
   - DS / DeepSeek default model selector
   - Online / offline control
   - Multi-knowledge-base selector (union scope when multiple selected)
   - `@标签` control (AND semantics when tags selected)
   - **No** material-upload plus on the homepage composer
   - With **no** selected knowledge base or tag → general-task AI mode (online/offline available)
   - Selecting **any** knowledge base or tag → force visually clear **严格 RAG / 不联网** state; disable online
   - Clearing scope restores general controls
   - General-mode answers omit citations; RAG-mode answers show only **fixed demo citations** (no fabricated ones)
   - Preserve selected scope for all messages in the simulated conversation until changed or reset by new conversation

2. **Knowledge-base material ingest (`MaterialIngest.jsx`)**
   - “添加资料” exposes **粘贴链接 / 上传文件**
   - Simulate multi-file queue cards
   - Insert into **current** knowledge base
   - White progress popover with parsing percentage
   - Card-at-list-bottom parsing progress
   - Retained failure cards with retry / delete
   - Automatic **attachment-only / link-only** downgrade after **three consecutive failures**
   - No real network/upload/parser; file chooser may use selected file names only; timers or test-controlled transitions for queued → parsing → ready → failed → downgraded

3. **Files**
   - Modify: `src/App.jsx` (wire HomeComposer on home; MaterialIngest on knowledge base add flow)
   - Create: `src/features/home/HomeComposer.jsx` (+ tests)
   - Create: `src/features/knowledge/MaterialIngest.jsx` (+ tests / state helpers as needed)
   - Modify: `src/styles.css` (and/or small feature CSS if cleaner)
   - Focused tests under `src/features/home` and `src/features/knowledge`

4. **Steps**
   - Step 1: Write failing interaction tests first (TDD)
   - Step 2: Implement deterministic UI state
   - Step 3: Run `npm run test:ui -- src/features/home src/features/knowledge`

## Integration notes (current codebase)

- Home currently uses inline `Composer` in `App.jsx` for both home (`compact=false`) and knowledge AI panel (`compact=true`).
- Keep the **compact knowledge-base AI composer** working (DeepSeek + `#` tag suggest upward). Task 7 homepage scope controls belong on the **non-compact home** composer; extract carefully so KB compact path does not regress.
- Knowledge materials are a static `materials` array in `App.jsx`; MaterialIngest should append simulated items into list state for the current `base`.
- Replace the bare “+ 添加链接” button with MaterialIngest entry that offers paste-link **and** upload-file.
- Preserve notes/inspiration features and existing nav/responsive behavior.
- Visual language: black theme, existing Refind density; do **not** reintroduce 1200px max-width shell (user-approved full-bleed layout already shipped).
- Match existing test patterns in `src/features/notes/NotesWorkspace.test.jsx` (Vitest + Testing Library + userEvent).

## Do NOT

- Do **not** commit (user rule + plan: no commits unless asked)
- Do **not** add real network, auth, or parsers
- Do **not** break mobile/tablet nav tests in `NotesWorkspace.test.jsx`
- Do **not** expand into Task 8 QA writeups

## Done report

Return: status DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT  
List files changed, tests run + results, how to demo, and any concerns.
