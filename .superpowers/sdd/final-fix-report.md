# Materials outline final-fix report

Date: 2026-09-18
Scope: Important findings from the final materials-outline-chapters review.

## Status

Fixed and verified. The commit SHA is recorded below after commit.

## Fixes

1. `NoteEditor` now reconciles saved outlines on mount, note change, and bound-card membership changes. It drops invalid IDs, parks missing bound IDs in `unassignedCardIds`, flattens the reconciled order back into `inspirationCardIds`, and commits only when the normalized outline changes.
2. Global inspiration-card deletion now removes the card from each affected note's outline and thoughts, updates local note state, and persists outline content through `updateNote`.
3. Added focused coverage for editor reconciliation and note-level global card removal.

## Verification

```text
$ cd refind-demo && npm run test:ui -- src/features/notes/materialOutline.test.js src/features/notes/NoteEditor.outline.test.jsx src/features/notes/NotesWorkspace.test.jsx
Test Files  3 passed (3)
Tests  37 passed (37)
```

Additional helper coverage:

```text
$ cd refind-demo && npm run test:ui -- src/features/notes/noteState.test.js
Test File  1 passed
Tests  7 passed
```

Linter diagnostics: none for edited files.

## Concerns

- The App-level delete handler persists outline-bearing notes with `updateNote`; material relation persistence remains owned by the existing card-delete/API path.
- The repository contained unrelated pre-existing worktree changes; only the relevant outline/delete files were staged for this fix commit.

## Commit

SHA: recorded in the final handoff; this report is included in the commit.
