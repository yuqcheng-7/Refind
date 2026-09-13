# Task 1 Brief: Dismissable menus + MaterialIngest restore

**Plan:** `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/docs/superpowers/plans/2026-09-13-menus-home-ai-material-preview.md` Task 1  
**Workdir:** `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo`

## Requirements

1. Create `src/hooks/useDismissable.js` — on open, listen for `pointerdown` outside root+trigger and `Escape` to call `onClose`. Cleanup on unmount/close.
2. Wire dismissable behavior to open menus: account, material filter, MaterialIngest menu/link popover, HomeComposer base/tag menus, compact model menu, history popover, kb rail menu, notes card filter if easy.
3. MaterialIngest: when status becomes `ready`, call `onMaterialReady` then **remove** that card from queue so tools row (search/filter/添加资料) restores. Keep `failed` / `downgraded` until user deletes.
4. TDD: write failing tests first, then implement.
5. Do NOT commit. Do NOT start Task 2 (home AI split).

## Verify

`npm run test:ui -- src/features/home src/features/knowledge`
`npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Return DONE / DONE_WITH_CONCERNS / BLOCKED with files changed and test results.
