# Task 6 Report: Auto-outline on enter fullscreen

## Status
DONE

## Changes
- Added fullscreen auto-outline in `NoteEditor` for notes with at least two cards and no saved outline.
- Reused `outlining` state and added visible `outlineError` with a usable `重试成章` action.
- Added per-note attempt tracking so card churn does not re-trigger outlining.
- Added TDD coverage for success, saved-outline skip, and failure/retry visibility.
- Updated the workspace outline test fixture for the new automatic call.

## Commit
`3368d4c` — fix(notes): reset auto-outline state on note switch

## Tests
- Focused: `npm run test:ui -- src/features/notes/NoteEditor.outline.test.jsx src/features/notes/NotesWorkspace.test.jsx` — **30 passed**.
- Full UI suite: **55 passed, 2 unrelated pre-existing failures** (`materials.test.js` Supabase mock lacks `delete`; `HomeComposer.test.jsx` online QW assertion).

## Report path
`/Users/zoecheng/Documents/ChatGPT/拾藏Refind/.superpowers/sdd/task-6-report.md`

## Fix: Important review findings

### Finding 1 — `autoOutlineAttemptedRef` never reset on note switch
Added a dedicated `useEffect` on `[note.id]` that resets `autoOutlineAttemptedRef.current = null` so each note gets one auto-outline attempt.

### Finding 2 — Cancelled in-flight outline left new note read-only
The same `note.id` effect calls `setOutlining(false)` and `setOutlineError(null)` before the auto-outline effect runs, so cleanup from a previous note's cancelled request cannot leave the new note stuck in `panelReadOnly`.

### Tests added
- `switches notes while outline is in flight without leaving the new note read-only` — Note A outline deferred → switch to Note B → B calls `onOutline`, stays outlining until B completes, then unlocks.
- `clears stuck outlining when switching away from a note mid-outline` — mid-flight switch to a note with saved outline clears outlining immediately and skips auto-outline.

### Test output
```
npm run test:ui -- src/features/notes/NoteEditor.outline.test.jsx

 ✓ src/features/notes/NoteEditor.outline.test.jsx (11 tests) 302ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
```
