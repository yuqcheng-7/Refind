# Task 6 Report: Auto-outline on enter fullscreen

## Status
DONE_WITH_CONCERNS

## Changes
- Added fullscreen auto-outline in `NoteEditor` for notes with at least two cards and no saved outline.
- Reused `outlining` state and added visible `outlineError` with a usable `重试成章` action.
- Added per-note attempt tracking so card churn does not re-trigger outlining.
- Added TDD coverage for success, saved-outline skip, and failure/retry visibility.
- Updated the workspace outline test fixture for the new automatic call.

## Commit
Pending parent-agent commit; only Task 6 files are changed.

## Tests
- Focused: `npm run test:ui -- src/features/notes/NoteEditor.outline.test.jsx src/features/notes/NotesWorkspace.test.jsx` — **30 passed**.
- Full UI suite: **55 passed, 2 unrelated pre-existing failures** (`materials.test.js` Supabase mock lacks `delete`; `HomeComposer.test.jsx` online QW assertion).

## Report path
`/Users/zoecheng/Documents/ChatGPT/拾藏Refind/.superpowers/sdd/task-6-report.md`
