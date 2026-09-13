# Notes Workspace Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Tighten the notes workspace layout and unify fullscreen create vs organize-from-cards flows per the 2026-09-13 notes remediation design.

**Architecture:** Keep `NotesWorkspace` as the shell; drive fullscreen via `inspirationEditorId` (or rename to `fullscreenNoteId` if clearer) plus a `showMaterials` flag derived from whether the note has inspiration cards / entered via organize. Compact CSS in `notes.css`; update `InspirationCards` toolbar; extend `NoteEditor` with a fullscreen toggle icon next to save state.

**Tech Stack:** React 19, Vite, lucide-react, Vitest, Testing Library, CSS.

## Global Constraints

- 「我的笔记」与「灵感卡片」为独立入口；灵感卡片仅用于创作笔记。
- 「新建笔记」全屏 **不显示** 素材面板；「整理为笔记」全屏 **显示** 素材面板。
- 双栏点全屏：若笔记已有灵感素材则显示素材面板。
- 全屏返回 →「我的笔记」Tab + 选中该笔记。
- Do not commit unless the user asks.
- Canonical design: `docs/superpowers/specs/2026-09-13-notes-workspace-remediation-design.md`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `refind-demo/src/features/notes/NotesWorkspace.jsx` | Header, tabs, create/organize/fullscreen routing |
| `refind-demo/src/features/notes/NoteEditor.jsx` | Save-state + fullscreen icon; materials panel gating |
| `refind-demo/src/features/notes/InspirationCards.jsx` | Remove filter; stretch search to 整理为笔记 |
| `refind-demo/src/styles/notes.css` | Compact spacing, black 新建笔记, single-row list tools |
| `refind-demo/src/features/notes/NotesWorkspace.test.jsx` | Cover create/organize/fullscreen/return behaviors |
| Docs | PRD §九 / Spec §11 / `design.md` §6（已先回写时可只核对） |

---

### Task 1: Header cleanup + compact layout + black 新建笔记

**Files:**
- Modify: `NotesWorkspace.jsx`, `notes.css`
- Test: `NotesWorkspace.test.jsx`

- [x] **Step 1: Write failing test** — header has no「个人记录」; 新建笔记 button present.
- [x] **Step 2: Remove eyebrow; align black primary 新建笔记 with title baseline.**
- [x] **Step 3: Reduce header/tabs/list/editor paddings; fix right/bottom drift.**
- [x] **Step 4: Run** `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

### Task 2: Notebook filter + search on one row

**Files:**
- Modify: `NotesWorkspace.jsx`, `notes.css`
- Test: list controls layout / labels

- [x] **Step 1: Failing test or DOM assertion** — filter and search share one toolbar row.
- [x] **Step 2: Compact notebook control + same-row search.**
- [x] **Step 3: Run focused notes tests.**

### Task 3: Fullscreen icon beside save state

**Files:**
- Modify: `NoteEditor.jsx`, `NotesWorkspace.jsx`, `notes.css`
- Test: clicking icon opens fullscreen; notes with cards show materials panel

- [x] **Step 1: Failing tests for fullscreen toggle + materials when `inspirationCardIds.length > 0`.**
- [x] **Step 2: Add icon left of「已保存」; wire `onEnterFullscreen`.**
- [x] **Step 3: Run focused notes tests.**

### Task 4: Inspiration cards toolbar — drop filter, stretch search

**Files:**
- Modify: `InspirationCards.jsx`, `notes.css`
- Test: no filter control; search adjacent to 整理为笔记

- [x] **Step 1: Failing test** — filter button absent; 整理为笔记 still works.
- [x] **Step 2: Remove source/time filter UI; flex search to fill.**
- [x] **Step 3: Run focused notes tests.**

### Task 5: Create vs organize fullscreen entry + return

**Files:**
- Modify: `NotesWorkspace.jsx`, `NoteEditor.jsx`, tests

- [x] **Step 1: Failing tests** —
  - 新建笔记（from notes or cards tab） → fullscreen, **no** materials panel;
  - 整理为笔记 → fullscreen **with** materials;
  - Back → tab `notes`, note selected and visible in list.
- [x] **Step 2: Implement create/organize/back routing.**
- [x] **Step 3: Run** `npm run test:ui -- src/features/notes` **and** `npm run test:ui`.

---

### Task 6: Follow-up polish — selection bar + note citation preview

**Files:**
- Modify: `notes.css`, `NoteEditor.jsx`, `noteState.js`, `NotesWorkspace.jsx`
- Docs: PRD / Spec / `design.md` / this plan + remediation design spec

- [x] **Step 1: Selection bar** — inset rounded bar (`border-radius: 12px`), not full-bleed; subtle L→R gradient `#EEEEED → #E9E9E8 → #E8E8E7`.
- [x] **Step 2: Note citations** — generated sections carry `cardId`; hover `[n]` shows preview menu; click opens `CardDetailDialog`.
- [x] **Step 3: Viewport clamp** — citation menu prefers end-align near right edge so it does not overflow the screen.
- [x] **Step 4: Sync** Spec / PRD / `design.md` / remediation design with the confirmed visuals & citation behavior.

---

## Plan Self-Review

- Design coverage: T1–T5 mapped 1:1; Task 6 covers confirmed polish (selection bar + citation preview).
- Materials panel rules explicit for create / organize / dual-pane fullscreen.
- Return path always lands on「我的笔记」with selection.
