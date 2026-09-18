# Inspiration Cards Manage Mode Design

Date: 2026-09-18  
Status: **Implemented**（`refind-demo` manage 模式 + 导入子菜单）  
Scope: `refind-demo` notes inspiration cards — multi-select manage (batch delete + import to notes), unified import submenu in card preview

## Goal

Add a **管理** entry on the inspiration cards header so users can multi-select cards to **批量删除** or **导入笔记**. Import supports both creating one new note per card and appending selected cards into an existing note. The same import submenu replaces the single **加入笔记** action in the card preview ⋯ menu.

**整理为笔记** remains unchanged and coexists with **管理**.

## Non-goals

- Changing organize-into-one-note (`createOrganizedNote`) behavior
- Auto-opening fullscreen after multi-card “新建笔记”
- Changing single-card delete confirm copy in preview
- Notebook manager / note-to-notebook import flows

## Approach

Shared multi-select UI with an explicit mode: `null | 'organize' | 'manage'`.

- **整理为笔记** → `organize` (existing bar: 取消 · 开始整理)
- **管理** → `manage` (bar: 已选 N · 取消 · 批量删除 · 导入笔记)
- Entering one mode clears the other mode’s selection and exits the previous mode

## §1 Entry and selection

### Header

Order: search → 筛选 → **管理** → **整理为笔记**  
**管理** uses the same button chrome as **整理为笔记** / 筛选.

### Selection chrome

Reuse existing card corner checkboxes and `is-selected` styling.

### Manage action bar

- `已选 N 张` (visible selection within current filter/search list)
- `取消` — exit manage mode, clear selection
- `批量删除` — disabled when N = 0; opens confirm alert before delete
- `导入笔记` — disabled when N = 0; opens submenu

### Organize action bar

Unchanged: `取消` · `开始整理`.

## §2 Import notes (batch + preview)

### Shared submenu

Triggered from:

1. Manage bar **导入笔记**
2. Card detail ⋯ menu (replaces flat **加入笔记**)

Items:

| Item | Behavior |
|------|----------|
| **新建笔记** | Each target card creates its own new note (same as today’s `addCardToNote` per card) |
| **加入已有笔记…** | Open note picker; attach all target cards to the chosen note |

Target cards:

- Manage mode: currently selected visible cards, in visible-list order
- Preview: the open card only

### 新建笔记 (batch)

1. For each selected card id in visible order, create a note and attach that single card (`attachCards` + persist materials), mirroring `addCardToNote`
2. Toast with created count (e.g. 已将 N 张灵感卡片加入新笔记)
3. Exit manage mode; do **not** force navigate into any one note

### 加入已有笔记…

1. Open `PickNoteDialog` (working name): list all notes with title + notebook label; single-select; confirm
2. On confirm: `attachCards(targetNote, selectedIds)` + persist materials
3. Toast success; exit manage mode
4. If launched from preview: close preview and select/open that note (same navigation spirit as today’s single add)

### Preview ⋯ menu

Replace:

- 加入笔记 → opens nested/submenu: 新建笔记 · 加入已有笔记…
- 删除卡片 — unchanged

## §3 Batch delete and wiring

### 批量删除

1. One `window.confirm` stating N cards will be deleted and removed from related notes’ material panels; generated note body is unchanged
2. On OK: delete all selected ids **without** additional per-card confirms (today’s `removeCard` always confirms once — batch must use a skip-confirm / `deleteCards(ids)` path that still notifies parent `onDeleteCard` / persistence the same way)
3. Toast success; exit manage mode

### Single-card delete (preview)

Keep existing confirm and copy (one confirm per card).

### Components

| Piece | Responsibility |
|-------|----------------|
| `InspirationCards` | `selectionMode`; manage bar; import submenu; wire batch actions |
| `PickNoteDialog` (new, or styled like existing import checklist) | Single-select note for attach |
| `CardDetailDialog` | Import submenu instead of one-shot 加入笔记 |
| `NotesWorkspace` | `addCardsAsNotes(ids)`, `attachCardsToNote(noteId, ids)`, batch delete entry; pass `notes` into picker |

Reuse existing helpers: `attachCards`, `createPersistedNote`, `persistMaterials`, `onDeleteCard` / `removeCard`.

## §4 Errors and tests

### Errors

If any create / attach / delete step fails: show error toast; do not roll back successful steps; do not force-exit selection (user can retry). On multi-step loops, **stop on first failure** and toast the partial count (e.g. 已创建 2/5 篇，其余失败).

### Tests

- Manage vs organize mutual exclusion
- Batch delete: confirm cancel does nothing; confirm OK deletes selected
- Import submenu exposes 新建笔记 / 加入已有笔记…
- Multi-card 新建笔记 creates N notes
- 加入已有笔记 attaches all selected ids to chosen note
- Preview ⋯ uses the same two import options

## Data flow (summary)

```
管理 → selectionMode=manage → selectedIds
  ├─ 批量删除 → confirm → delete each id → toast → exit
  └─ 导入笔记
       ├─ 新建笔记 → for each id: create note + attach [id] → toast → exit
       └─ 加入已有笔记… → PickNoteDialog → attachCards(note, ids) → toast → exit
                                              (+ open note if from preview)

整理为笔记 → selectionMode=organize → 开始整理 → createOrganizedNote(ids)  [unchanged]
```

## Open decisions resolved in brainstorm

- Import = A (one note per card) **and** C (append to existing note)
- Submenu pattern for choosing A vs C (also in preview)
- Keep 整理为笔记 alongside 管理
- Delete control label: **批量删除** + alert
