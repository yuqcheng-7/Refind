# Task 6 — NoteEditor autosave unmount flush

## Finding

`NoteEditor` cleared the autosave debounce timer on unmount without flushing a pending draft. Navigating away within the 1200 ms debounce window could drop unsaved title/content changes.

## Fix

- Added `onPersistRef` so the unmount cleanup always calls the latest persist handler.
- Unmount cleanup now flushes `pendingPersistRef` via `onPersist` before clearing the timer.
- Debounced timer callback clears `pendingPersistRef` after persist so completed saves are not duplicated on unmount.

## Verification

- `npm run test:ui -- src/features/notes/` — all notes tests passed.
