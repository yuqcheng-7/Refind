# Inspiration Cards Manage Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inspiration-card **管理** multi-select for batch delete and import-to-notes (new note per card, or attach to an existing note), and unify the card-preview ⋯ import submenu with the same two options.

**Architecture:** Extend `InspirationCards` with `selectionMode: null | 'organize' | 'manage'`. Wire batch actions through `NotesWorkspace` (`addCardsAsNotes`, `attachCardsToNote`, `removeCards`). Add `PickNoteDialog` for choosing a target note. Change `CardDetailDialog` 加入笔记 into a two-item submenu.

**Tech Stack:** React, Vitest, Testing Library, existing notes CSS tokens / dialog patterns.

**Spec:** `docs/superpowers/specs/2026-09-18-inspiration-cards-manage-design.md`

## Global Constraints

- Keep **整理为笔记** behavior unchanged; coexist with **管理**.
- Manage bar: `取消` · `批量删除` · `导入笔记` (submenu: `新建笔记` · `加入已有笔记…`).
- Batch delete: one `window.confirm`, then delete without per-card confirms.
- Multi-card 新建笔记: one note per card; toast count; exit selection; do not force-open a note.
- Preview 加入已有笔记: close preview and open the target note.
- On loop failure: stop, toast partial count, keep selection open.
- Do not commit unless the user explicitly asks.

---

## File map

| File | Role |
|------|------|
| `refind-demo/src/features/notes/InspirationCards.jsx` | Manage entry, mode, bar, import menu |
| `refind-demo/src/features/notes/NoteDialogs.jsx` | `PickNoteDialog`; CardDetail import submenu |
| `refind-demo/src/features/notes/NotesWorkspace.jsx` | Batch create / attach / delete helpers; pass props |
| `refind-demo/src/styles/notes.css` | Manage button + import submenu + picker if needed |
| `refind-demo/src/features/notes/InspirationCards.test.jsx` | Manage / organize / batch UI tests |
| `refind-demo/src/features/notes/NoteDialogs.cardDetail.test.jsx` | Preview submenu tests |
| `refind-demo/src/features/notes/NotesWorkspace.test.jsx` | Workspace wiring tests |

---

### Task 1: Workspace batch helpers

**Files:**
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- Produces:
  - `removeCards(cardIds: string[]) => void` — one confirm for `cardIds.length`; then `onDeleteCard` each id without further confirms
  - `addCardsAsNotes(cardIds: string[]) => Promise<number>` — create one note per id in order; return created count; stop on first failure; do not open fullscreen
  - `attachCardsToNote(noteId: string, cardIds: string[]) => Promise<void>` — attach all ids to that note; optionally open note when `options.openNote === true`

- [ ] **Step 1: Write failing tests** for `removeCards` confirm-once and `addCardsAsNotes` creating N notes without opening fullscreen. Prefer testing through InspirationCards props once Task 2 exists; until then add focused workspace tests that mock `createPersistedNote` / `persistMaterials` if already mocked in file, or cover via InspirationCards integration in Task 2–3.

Minimal workspace-level expectations (extend existing mock patterns in `NotesWorkspace.test.jsx`):

```js
it('batch-deletes selected cards after a single confirm', async () => {
  // enter manage, select two cards, click 批量删除, confirm once
  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(onDeleteCard).toHaveBeenCalledTimes(2);
});

it('creates one note per selected card without forcing fullscreen', async () => {
  // manage → select 2 → 导入笔记 → 新建笔记
  expect(createPersistedNote).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('textbox', { name: /标题/ })).not.toBeInTheDocument(); // or assert tab still cards / no inspiration fullscreen
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd refind-demo && npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx src/features/notes/InspirationCards.test.jsx
```

- [ ] **Step 3: Implement helpers in NotesWorkspace**

```js
const removeCards = (cardIds) => {
  if (!cardIds?.length) return;
  const affected = notes.filter((note) => note.inspirationCardIds.some((id) => cardIds.includes(id)));
  if (!window.confirm(`删除这 ${cardIds.length} 张卡片将从 ${affected.length} 篇笔记的素材面板中移除；已生成的正文不会改变。确定删除吗？`)) return;
  cardIds.forEach((id) => onDeleteCard?.(id));
  notice?.(`已删除 ${cardIds.length} 张灵感卡片。`);
};

const addCardsAsNotes = async (cardIds) => {
  let created = 0;
  try {
    for (const cardId of cardIds) {
      const nextNote = attachCards(await createPersistedNote(), [cardId]);
      await persistMaterials(nextNote);
      setNotes((items) => [nextNote, ...items]);
      created += 1;
    }
    notice?.(created === 1 ? '已将灵感卡片加入新笔记。' : `已将 ${created} 张灵感卡片加入新笔记。`);
    return created;
  } catch {
    notice?.(created ? `已创建 ${created}/${cardIds.length} 篇，其余失败。` : '添加灵感卡片失败，请稍后重试。');
    throw new Error('addCardsAsNotes failed');
  }
};

const attachCardsToNote = async (noteId, cardIds, { openNote = false } = {}) => {
  const target = notes.find((note) => note.id === noteId);
  if (!target) throw new Error('note not found');
  const nextNote = attachCards(target, cardIds);
  await persistMaterials(nextNote);
  updateNote(nextNote);
  if (openNote) {
    setSelectedNoteId(nextNote.id);
    setFullscreenNoteId(nextNote.id);
    setTab('notes');
  }
  notice?.(`已将 ${cardIds.length} 张灵感卡片加入笔记。`);
};
```

Keep `removeCard` / `addCardToNote` for single-card paths. Preview「新建笔记」can call `addCardToNote` (opens note) or `addCardsAsNotes([id])` then open — prefer: preview 新建笔记 keeps open-note UX via existing `addCardToNote`; batch uses `addCardsAsNotes`.

- [ ] **Step 4: Pass new callbacks into InspirationCards and NoteEditor/CardDetail**

```jsx
<InspirationCards
  ...
  notes={notes}
  notebooks={managedNotebooks}
  onDeleteCards={removeCards}
  onAddCardsAsNotes={addCardsAsNotes}
  onAttachCardsToNote={attachCardsToNote}
/>
```

- [ ] **Step 5: Run tests — expect PASS for Task 1 coverage once UI exists (finish with Task 2–3)**

---

### Task 2: InspirationCards manage mode UI

**Files:**
- Modify: `refind-demo/src/features/notes/InspirationCards.jsx`
- Modify: `refind-demo/src/styles/notes.css`
- Modify: `refind-demo/src/features/notes/InspirationCards.test.jsx`

**Interfaces:**
- Consumes: `onDeleteCards`, `onAddCardsAsNotes`, `onAttachCardsToNote`, `notes`, `notebooks`
- Produces: manage selection UX; calls parent with ordered visible selected ids

- [ ] **Step 1: Failing tests**

```js
it('enters manage mode and shows batch actions', async () => {
  render(<InspirationCards cards={cards} onDeleteCards={vi.fn()} onAddCardsAsNotes={vi.fn()} onAttachCardsToNote={vi.fn()} notes={[]} notebooks={[]} />);
  await userEvent.click(screen.getByRole('button', { name: '管理' }));
  expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '导入笔记' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /选择卡片：general-today/ }));
  expect(screen.getByRole('button', { name: '批量删除' })).toBeEnabled();
});

it('keeps organize and manage mutually exclusive', async () => {
  await userEvent.click(screen.getByRole('button', { name: '管理' }));
  await userEvent.click(screen.getByRole('button', { name: /选择卡片：general-today/ }));
  await userEvent.click(screen.getByRole('button', { name: '整理为笔记' })); // only visible when not selecting — after cancel
  // assert: starting organize clears manage selection; starting manage clears organize
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Replace `selecting` boolean with:

```js
const [selectionMode, setSelectionMode] = useState(null); // null | 'organize' | 'manage'
```

Header when `!selectionMode`:

```jsx
<button type="button" className="cards-header__organize" onClick={() => { setSelectedIds([]); setSelectionMode('manage'); }}>管理</button>
<button type="button" className="cards-header__organize" onClick={() => { setSelectedIds([]); setSelectionMode('organize'); }}>…整理为笔记</button>
```

Manage bar:

```jsx
{selectionMode === 'manage' && (
  <div className="cards-selection-bar">
    <span>已选 <em>{visibleSelectedIds.length}</em> 张</span>
    <div>
      <button type="button" onClick={exitSelection}>取消</button>
      <button type="button" disabled={!visibleSelectedIds.length} onClick={() => onDeleteCards?.(visibleSelectedIds)}>批量删除</button>
      <div className="cards-selection-bar__import" ref={importRef}>
        <button type="button" disabled={!visibleSelectedIds.length} aria-expanded={importOpen} onClick={() => setImportOpen((o) => !o)}>导入笔记</button>
        {importOpen && (
          <div role="menu" className="cards-import-menu">
            <button type="button" role="menuitem" onClick={async () => { … await onAddCardsAsNotes?.(visibleSelectedIds); exitSelection(); }}>新建笔记</button>
            <button type="button" role="menuitem" onClick={() => { setImportOpen(false); setPickNoteOpen(true); }}>加入已有笔记…</button>
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

On successful batch delete / create: parent toasts; child still calls `exitSelection()` after successful create. If `addCardsAsNotes` throws, do **not** exit.

Wire `PickNoteDialog` when `pickNoteOpen` (Task 3 can land dialog first).

- [ ] **Step 4: CSS** — `.cards-header__manage` optional alias of organize; `.cards-import-menu` like filter menu; selection bar tertiary button for 批量删除 (danger-neutral, not primary — primary remains 导入笔记 or keep both secondary + dark primary on 导入笔记). Prefer: 取消 text · 批量删除 text · 导入笔记 dark primary (match organize bar pattern).

- [ ] **Step 5: Tests PASS**

---

### Task 3: PickNoteDialog

**Files:**
- Modify: `refind-demo/src/features/notes/NoteDialogs.jsx`
- Create or extend: `refind-demo/src/features/notes/NoteDialogs.pickNote.test.jsx` (or add to cardDetail / InspirationCards tests)

**Interfaces:**
- Produces: `PickNoteDialog({ notes, notebooks, onConfirm(noteId), onClose })`

- [ ] **Step 1: Failing test**

```js
it('confirms a single selected note', async () => {
  const onConfirm = vi.fn();
  render(<PickNoteDialog notes={[{ id: 'n1', title: '增长笔记', notebookId: null }]} notebooks={[]} onConfirm={onConfirm} onClose={vi.fn()} />);
  await userEvent.click(screen.getByRole('radio', { name: /增长笔记/ }));
  await userEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(onConfirm).toHaveBeenCalledWith('n1');
});
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement dialog** using `DialogShell`; radio list of notes showing `title || '未命名笔记'` and notebook name (`未分类` if null); Confirm disabled until selection.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Wire from InspirationCards** — on confirm call `onAttachCardsToNote(noteId, visibleSelectedIds)` then `exitSelection()`; on throw keep selection.

---

### Task 4: CardDetailDialog import submenu

**Files:**
- Modify: `refind-demo/src/features/notes/NoteDialogs.jsx` (`CardDetailDialog`)
- Modify: `refind-demo/src/features/notes/NoteDialogs.cardDetail.test.jsx`
- Modify: `InspirationCards` / `NotesWorkspace` props: `onAddToNote` stays for 新建; add `onAttachCardToNote` or reuse `onAttachCardsToNote(noteId, [card.id], { openNote: true })`

- [ ] **Step 1: Failing test**

```js
expect(screen.queryByRole('menuitem', { name: '加入笔记' })).not.toBeInTheDocument();
await userEvent.click(… more …);
// Prefer nested: menuitem 加入笔记 expands submenu OR replace with two items:
expect(screen.getByRole('menuitem', { name: '新建笔记' })).toBeVisible();
expect(screen.getByRole('menuitem', { name: '加入已有笔记…' })).toBeVisible();
```

Spec: replace flat 加入笔记 with submenu **新建笔记 / 加入已有笔记…**. Implementation: either nested submenu under「加入笔记」or two top-level items replacing it. Prefer **two top-level items** (simpler, matches manage submenu items) labeled `新建笔记` and `加入已有笔记…`.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement** — 新建笔记 → `onAddToNote?.(card)`; 加入已有笔记… → open `PickNoteDialog`; on confirm `onAttachCardsToNote?.(noteId, [card.id], { openNote: true })` then `onClose()`.

- [ ] **Step 4: Update tests that asserted `加入笔记` menuitem**

- [ ] **Step 5: PASS**

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run**

```bash
cd refind-demo && npm run test:ui -- \
  src/features/notes/InspirationCards.test.jsx \
  src/features/notes/NoteDialogs.cardDetail.test.jsx \
  src/features/notes/NotesWorkspace.test.jsx
```

Expected: all PASS

- [ ] **Step 2: Manual smoke** (if app running): 管理 → select → 批量删除 cancel/ok; 导入 → 新建; 导入 → 加入已有; preview ⋯ same two actions; 整理为笔记 still works.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| 管理 + 整理 coexist | 2 |
| Mutual exclusive modes | 2 |
| 批量删除 + single confirm | 1, 2 |
| 导入 submenu A+C | 2, 3 |
| Preview same import options | 4 |
| Partial failure toast / keep selection | 1, 2 |
| No auto-fullscreen on batch create | 1 |
| Organize unchanged | 2 |

## Self-review notes

- No TBD left; error policy fixed to stop-on-first-failure.
- Batch delete must not call `removeCard` (would re-confirm); uses `removeCards` / direct `onDeleteCard`.
- Preview 新建笔记 keeps open-note UX via `addCardToNote`.
