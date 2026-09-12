# Refind Notes & Inspiration Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local, high-fidelity React prototype for notes, inspiration cards, AI-answer capture, full-screen card-based writing, simulated multi-knowledge-base syncing, and the confirmed homepage-AI / knowledge-base-upload interactions.

**Architecture:** Keep the app as a Vite SPA with demo-only state held in React. Move note/card data into focused `src/features/notes` modules and homepage-AI/material-ingest simulations into `src/features/home` and `src/features/knowledge`; keep `App.jsx` responsible for global navigation and shared notices. Persist no data beyond the current browser session; AI, upload, parsing, failure and retry states are deterministic local simulations.

**Tech Stack:** React 19, Vite 6, lucide-react, CSS, Vitest, Testing Library.

## Global Constraints

- Phase one is a local interactive prototype only: no authentication, database, external AI, real file parsing, external link parsing or network calls. It must faithfully simulate the approved states.
- Preserve `refind-demo/worker/index.js`, `refind-demo/scripts/prepare-sites-build.mjs`, `refind-demo/tests/sites-worker.test.mjs`, and Sites build output requirements.
- Preserve the existing Refind palette, typography, compact desktop density, sidebar, home hero and knowledge-base layout.
- Desktop design baseline is 1920px. The complete core workbench, including global navigation, has a 1200px maximum safe width and is left aligned; wide-screen overflow is background/negative space, not stretched workbench columns.
- At `≥1200px`, show the desktop workbench with a 220px expanded global sidebar or icon-only collapsed sidebar. At `768–1199px`, show compact two-pane notes/material layouts and use overlay panels for AI, filtering and materials. Below `768px`, use one content pane plus a navigation drawer and overlay panels; all touch targets are at least 44px.
- Do not add a global navigation item for inspiration cards; it is a Tab inside the Notes workspace.
- Note content uses a local `rich_text_json`-shaped document model. The prototype toolbar may use deterministic formatting controls, but must not expose Markdown syntax.
- Homepage composer has a DS / DeepSeek default model selector, online/offline control, multi-knowledge-base selector and `@标签`; no material-upload plus. With no selected range it simulates general task AI; any selected knowledge base or tag forces a visually clear “严格 RAG / 不联网” state, knowledge-base union and tag-AND semantics, without fabricated citations.
- Knowledge-base “添加资料” exposes “粘贴链接 / 上传文件”; simulate multi-file queue cards, direct current-base insertion, white progress popover, parsing percentage, retained failure cards, retry and “连续三次失败后仅链接/仅附件” downgrade.
- Use `apply_patch` for all file changes. Do not commit: this workspace has no initial commit and contains user-owned untracked files.
- Before handoff, run `npm run test:ui`, `npm run build`, and `npm run test:sites` from `refind-demo/`.

---

## Planned File Structure

| File | Responsibility |
| --- | --- |
| `refind-demo/src/App.jsx` | Global nav, current view, shared notice, home and knowledge-base composition. |
| `refind-demo/src/features/notes/demoData.js` | Fixed demo notebooks, notes, AI responses, inspiration cards and source metadata. |
| `refind-demo/src/features/notes/noteState.js` | Pure state helpers for note/card selection, note creation, card attachment, generation replacement and simulated syncing. |
| `refind-demo/src/features/notes/NotesWorkspace.jsx` | Notes Tab switcher, notebook filter, searchable list and editor orchestration. |
| `refind-demo/src/features/notes/NoteEditor.jsx` | Standard editor and full-screen inspiration editor, toolbar, title/body inputs, materials panel and generated-citation behavior. |
| `refind-demo/src/features/notes/InspirationCards.jsx` | Card search/filter/list, detail dialog, selection mode and organize flow. |
| `refind-demo/src/features/notes/NoteDialogs.jsx` | Reusable add-to-note, add-to-knowledge-base, deletion and source dialogs. |
| `refind-demo/src/features/knowledge/AnswerActions.jsx` | Answer-end actions and selected-text card capture menu. |
| `refind-demo/src/features/home/HomeComposer.jsx` | Home model, online, knowledge-base and tag scope controls with deterministic general/RAG states. |
| `refind-demo/src/features/knowledge/MaterialIngest.jsx` | Add-material menu, multi-file progress popover and parsing/failure card state. |
| `refind-demo/src/styles/notes.css` | Notes/card/editor-specific visual rules imported by `styles.css`. |
| `refind-demo/src/features/notes/noteState.test.js` | Pure state and generated-content unit tests. |
| `refind-demo/src/features/notes/NotesWorkspace.test.jsx` | UI tests for notes, cards, selection mode and generation states. |

## Task 1: Add UI-test tooling and demo-domain helpers

**Files:**
- Modify: `refind-demo/package.json`
- Modify: `refind-demo/vite.config.mjs`
- Create: `refind-demo/src/features/notes/demoData.js`
- Create: `refind-demo/src/features/notes/noteState.js`
- Create: `refind-demo/src/features/notes/noteState.test.js`

**Interfaces:**
- Produces `createBlankNote(now)`, `filterNotes(notes, query, notebookId)`, `attachCards(note, cardIds)`, `generateNoteDocument(note, cards)` and `syncNoteToBases(note, baseIds)`.
- `Note` is `{ id, title, content, notebookId, updatedLabel, inspirationCardIds, syncedBaseIds }`.
- `InspirationCard` is `{ id, contentSnapshot, questionSnapshot, answerMode, sourceLabel, savedAt, citation? }`.

- [ ] **Step 1: Write failing pure-state tests**

```js
import { describe, expect, it } from 'vitest';
import { attachCards, createBlankNote, filterNotes, generateNoteDocument } from './noteState.js';

describe('note state', () => {
  it('creates an immediately selectable unnamed note', () => {
    expect(createBlankNote(1700000000000)).toMatchObject({
      id: 'note-1700000000000', title: '未命名笔记', notebookId: null, inspirationCardIds: [],
    });
  });

  it('finds a note through its title or body text', () => {
    const notes = [{ id: 'n1', title: '会员活动设计', content: { text: '先降低首次行动门槛' }, notebookId: null }];
    expect(filterNotes(notes, '首次', 'all')).toHaveLength(1);
    expect(filterNotes(notes, '会员', 'all')).toHaveLength(1);
  });

  it('appends newly selected cards after existing material', () => {
    expect(attachCards({ inspirationCardIds: ['c1'] }, ['c2', 'c3']).inspirationCardIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('creates citation nodes only for RAG cards', () => {
    const doc = generateNoteDocument({ title: '增长笔记', inspirationCardIds: ['rag', 'general'] }, [
      { id: 'rag', contentSnapshot: '缩短首次价值时间', answerMode: 'rag', citation: { label: '小红书增长策略' } },
      { id: 'general', contentSnapshot: '建立可持续的复盘节奏', answerMode: 'general' },
    ]);
    expect(doc.blocks.some((block) => block.citationLabel === '小红书增长策略')).toBe(true);
    expect(doc.blocks.some((block) => block.text.includes('建立可持续的复盘节奏'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:ui -- src/features/notes/noteState.test.js`

Expected: failure because the test script and state module do not exist.

- [ ] **Step 3: Add test configuration and minimal domain module**

```json
{
  "scripts": {
    "test:ui": "vitest run",
    "test:ui:watch": "vitest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
  }
}
```

```js
export function createBlankNote(now = Date.now()) {
  return { id: `note-${now}`, title: '未命名笔记', content: { text: '', blocks: [] }, notebookId: null, updatedLabel: '刚刚创建', inspirationCardIds: [], syncedBaseIds: [] };
}

export function filterNotes(notes, query, notebookId) {
  const needle = query.trim().toLowerCase();
  return notes.filter((note) => (notebookId === 'all' || note.notebookId === notebookId) && (!needle || `${note.title} ${note.content.text}`.toLowerCase().includes(needle)));
}

export function attachCards(note, cardIds) {
  return { ...note, inspirationCardIds: [...note.inspirationCardIds, ...cardIds.filter((id) => !note.inspirationCardIds.includes(id))] };
}

export function generateNoteDocument(note, cards) {
  const selected = note.inspirationCardIds.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
  return { text: selected.map((card) => card.contentSnapshot).join('\n\n'), blocks: selected.map((card) => ({ text: card.contentSnapshot, citationLabel: card.answerMode === 'rag' ? card.citation?.label : undefined })) };
}
```

- [ ] **Step 4: Configure jsdom test environment**

```js
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] },
  plugins: [react()],
});
```

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Install and verify unit tests**

Run: `npm install && npm run test:ui -- src/features/notes/noteState.test.js`

Expected: 4 passing tests.

## Task 2: Build the My Notes two-pane workspace

**Files:**
- Modify: `refind-demo/src/App.jsx`
- Create: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Create: `refind-demo/src/features/notes/NoteEditor.jsx`
- Create: `refind-demo/src/styles/notes.css`
- Modify: `refind-demo/src/styles.css`
- Create: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `NotesWorkspace({ notes, setNotes, cards, notice })` renders `我的笔记` and delegates to `NoteEditor`.
- `NoteEditor({ note, onChange, mode })` supports `mode="plain" | "inspiration"`.

- [ ] **Step 1: Write failing workspace tests**

```jsx
it('places notebook filtering before note search and creates an unnamed note', async () => {
  render(<NotesWorkspace {...noteProps} />);
  expect(screen.getByRole('button', { name: '全部笔记' })).toBeVisible();
  expect(screen.getByPlaceholderText('搜索笔记')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '新建笔记' }));
  expect(screen.getByDisplayValue('未命名笔记')).toBeVisible();
});

it('loads a selected note without focusing its body', async () => {
  render(<NotesWorkspace {...noteProps} />);
  await userEvent.click(screen.getByRole('button', { name: /会员活动设计/ }));
  expect(screen.getByDisplayValue('会员活动设计')).toBeVisible();
  expect(document.activeElement).not.toBe(screen.getByLabelText('笔记正文'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because `NotesWorkspace` does not exist.

- [ ] **Step 3: Implement the two-pane workspace**

```jsx
<section className="notes-workspace">
  <header className="notes-workspace__header">
    <div><span>个人记录</span><h1>笔记</h1></div>
    <button type="button" onClick={createNote}><Pencil size={16} />新建笔记</button>
  </header>
  <div className="notes-workspace__tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'notes'}>我的笔记</button>
    <button role="tab" aria-selected={tab === 'cards'}>灵感卡片</button>
  </div>
  <div className="notes-workspace__body">
    <aside className="notes-list">
      <button type="button" aria-expanded={notebookMenuOpen} onClick={() => setNotebookMenuOpen((open) => !open)}>全部笔记</button>
      <input aria-label="搜索笔记" placeholder="搜索笔记" value={query} onChange={(event) => setQuery(event.target.value)} />
      {groupedNotes.map(({ label, items }) => <section key={label}><h2>{label}</h2>{items.map((note) => <button key={note.id} type="button" onClick={() => setSelectedNoteId(note.id)}>{note.title}</button>)}</section>)}
    </aside>
    <NoteEditor note={selectedNote} mode="plain" onChange={updateNote} />
  </div>
</section>
```

Implement the list controls in this order: notebook-filter button (`全部笔记`), menu containing `管理笔记本`, then the search input, then `最近编辑` / `更早` groups. Use an independent title input above the editable body. Start an auto-save timer on title/body changes and expose `正在保存` then `已保存` in the toolbar.

- [ ] **Step 4: Add notes CSS without altering knowledge-base geometry**

```css
.notes-workspace__body { display:grid; grid-template-columns:320px minmax(0,1fr); height:calc(100vh - 170px); }
.notes-list { border-right:1px solid rgba(151,164,181,.30); padding:20px; overflow:auto; }
.note-editor { min-width:0; display:flex; flex-direction:column; padding:28px 56px; }
.note-editor__title { border:0; background:transparent; font-size:32px; font-weight:700; outline:0; }
@media (max-width:1199px) { .app-shell { grid-template-columns:64px minmax(0,1fr); } .notes-workspace__body { grid-template-columns:280px minmax(0,1fr); } }
@media (max-width:767px) { .app-shell { display:block; } .home-sidebar { position:fixed; transform:translateX(-100%); } .notes-workspace__body { display:block; } .notes-list[data-mobile-hidden='true'] { display:none; } }
```

- [ ] **Step 5: Run focused tests**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: all workspace tests pass.

## Task 3: Add inspiration-card capture to AI answers

**Files:**
- Create: `refind-demo/src/features/knowledge/AnswerActions.jsx`
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/styles/notes.css`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `AnswerActions({ answer, onSaveCard, onAddToNote })` owns capture menu state.
- `onSaveCard({ contentSnapshot, questionSnapshot, answerMode, citation })` adds a card to app-level state.

- [ ] **Step 1: Add failing capture tests**

```jsx
it('offers card save and add-to-note choices from an answer action', async () => {
  render(<AnswerActions answer={answer} onSaveCard={vi.fn()} onAddToNote={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: '收藏整条回答' }));
  expect(screen.getByRole('menuitem', { name: '保存为灵感卡片' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: '加入笔记' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because `AnswerActions` is absent.

- [ ] **Step 3: Implement answer-end controls and selected-text capture**

```jsx
<div className="answer-actions">
  <button aria-label="收藏整条回答" onClick={() => openCapture(answer.content)}> <BookmarkPlus size={16} /> </button>
  <button aria-label="复制回答" onClick={() => navigator.clipboard?.writeText(answer.content)}><Copy size={16} /></button>
  <button aria-label="分享回答"><Share2 size={16} /></button>
  <button aria-label="更多操作"><MoreHorizontal size={16} /></button>
</div>
```

Wrap answer text in a selection handler. When `window.getSelection().toString().trim()` is non-empty, show a positioned mini menu containing `收藏灵感卡片`; selecting it opens the same two-option destination menu as whole-answer capture. Keep delete and feedback in the more menu.

- [ ] **Step 4: Run the capture test**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: capture destination menu test passes.

## Task 4: Build the Inspiration Cards tab and organize selection mode

**Files:**
- Create: `refind-demo/src/features/notes/InspirationCards.jsx`
- Create: `refind-demo/src/features/notes/NoteDialogs.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/styles/notes.css`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `InspirationCards({ cards, onCreateOrganizedNote, onDeleteCard })` returns selected IDs in visible-list order.
- `CardDetailDialog({ card, onAddToNote, onDelete, onClose })` exposes `加入笔记` plus a more menu.

- [ ] **Step 1: Write failing card-tab tests**

```jsx
it('enters selection mode from organize and carries visible-list order into a note', async () => {
  render(<NotesWorkspace {...noteProps} />);
  await userEvent.click(screen.getByRole('tab', { name: '灵感卡片' }));
  await userEvent.click(screen.getByRole('button', { name: '整理为笔记' }));
  await userEvent.click(screen.getByLabelText('选择卡片：c3'));
  await userEvent.click(screen.getByLabelText('选择卡片：c1'));
  await userEvent.click(screen.getByRole('button', { name: '开始整理' }));
  expect(screen.getAllByTestId('material-card').map((node) => node.dataset.cardId)).toEqual(['c1', 'c3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because the card Tab and selection controls are absent.

- [ ] **Step 3: Implement card browsing and detail dialog**

```jsx
<header className="cards-header">
  <input aria-label="搜索灵感卡片" placeholder="搜索灵感卡片" value={query} onChange={(event) => setQuery(event.target.value)} />
  <button type="button" onClick={() => setSelecting(true)}>整理为笔记</button>
</header>
{selecting && <div className="cards-selection-bar"><span>已选 {selectedIds.length} 张</span><button>取消</button><button disabled={!selectedIds.length}>开始整理</button></div>}
```

Filter by card text/question, source (`全部来源` / `首页通用 AI` / knowledge base) and saved time; sort fixed newest first. Render no checkboxes until selection mode. Make each card open `CardDetailDialog`; delete asks for confirmation with the number of affected note material panels, removes the card from those panels and leaves generated note bodies unchanged.

- [ ] **Step 4: Run focused tests**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: card selection test passes.

## Task 5: Implement full-screen inspiration editor and simulated generation

**Files:**
- Modify: `refind-demo/src/features/notes/NoteEditor.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/styles/notes.css`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `NoteEditor` receives `mode="inspiration"`, `cards`, `onAttachCards`, `onGenerate`, and `onOpenCitation`.
- `onGenerate` creates a revision snapshot before replacing `note.content`.

- [ ] **Step 1: Write failing full-screen editor tests**

```jsx
it('disables generation with no material and replaces the body after deterministic generation', async () => {
  render(<NoteEditor mode="inspiration" note={{ ...emptyNote, inspirationCardIds: [] }} cards={cards} />);
  expect(screen.getByRole('button', { name: '生成笔记' })).toBeDisabled();

  render(<NoteEditor mode="inspiration" note={noteWithCards} cards={cards} />);
  await userEvent.click(screen.getByRole('button', { name: '生成笔记' }));
  expect(screen.getByRole('button', { name: '生成中' })).toBeDisabled();
  await waitFor(() => expect(screen.getByText(/缩短首次价值时间/)).toBeVisible());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because inspiration mode is absent.

- [ ] **Step 3: Implement editor mode and material panel**

```jsx
{mode === 'inspiration' && <>
  <button type="button" onClick={() => setPickerOpen(true)}>添加灵感卡片</button>
  <button type="button" onClick={() => setPanelOpen((open) => !open)}>素材面板</button>
  <button type="button" disabled={!note.inspirationCardIds.length || generating} onClick={generate}>
    {generating ? '生成中' : '生成笔记'}
  </button>
  {panelOpen && <MaterialsPanel cards={selectedCards} onReorder={reorderCards} onChangeThought={updateCardThought} onRemove={removeCard} />}
</>}
```

Create the note as soon as organizing starts. The editor must hide the global sidebar/list, preserve the panel open/closed state, scroll the document to the top after a simulated 700 ms generation, disable editing while generating, and on error keep original content/cards with a retry notice. Use `generateNoteDocument` to create deterministic text. Render RAG citation labels as focusable `[1]` controls with hover/fixed popovers; render no citation control for general-AI cards.

- [ ] **Step 4: Implement local undo/redo and revisions**

```js
const [undoStack, setUndoStack] = useState([]);
const commit = (next) => { setUndoStack((stack) => [...stack, note.content]); onChange({ ...note, content: next }); };
const undo = () => { const previous = undoStack.at(-1); if (previous) { onChange({ ...note, content: previous }); setUndoStack((stack) => stack.slice(0, -1)); } };
```

Snapshot the pre-generation title/content in local `revisions` state before replacement. Keep ordinary text formatting actions and material changes in the same undo history.

- [ ] **Step 5: Run editor tests**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: generation loading/success test passes.

## Task 6: Add simulated multi-base syncing and destructive-action feedback

**Files:**
- Modify: `refind-demo/src/features/notes/NoteDialogs.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/features/notes/noteState.js`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `KnowledgeBaseSyncDialog({ note, bases, onConfirm, onClose })` accepts multiple base IDs.
- `syncNoteToBases(note, baseIds)` returns `{ synced: baseIds, failed: [] }` in phase one.

- [ ] **Step 1: Write failing sync/delete tests**

```jsx
it('shows non-blocking multi-base sync progress and preserves cards when deleting a note', async () => {
  render(<NotesWorkspace {...noteProps} />);
  await userEvent.click(screen.getByRole('button', { name: /会员活动设计/ }), { button: 2 });
  await userEvent.click(screen.getByRole('menuitem', { name: '添加至知识库' }));
  await userEvent.click(screen.getByLabelText('产品与设计资料'));
  await userEvent.click(screen.getByRole('button', { name: '确认同步' }));
  expect(screen.getByRole('status')).toHaveTextContent('正在同步至 1 个知识库');
  await userEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));
  expect(screen.getByText(/将同步删除.*资料/)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because the right-click menu and sync dialog are absent.

- [ ] **Step 3: Implement menus, dialogs and notices**

```jsx
<KnowledgeBaseSyncDialog
  note={note}
  bases={bases}
  onConfirm={(baseIds) => {
    setSyncState({ status: 'syncing', total: baseIds.length });
    setTimeout(() => {
      updateNote(syncNoteToBases(note, baseIds));
      setSyncState({ status: 'complete', total: baseIds.length });
    }, 500);
  }}
/>
```

Provide the note context menu with notebook move, add/view/remove knowledge bases, and delete. The delete confirmation must say exactly how many synchronized materials will be removed. Implement notebook management with create/rename/delete and the required second choice: move contained notes to unfiled or permanently delete contained notes plus their simulated synced materials.

- [ ] **Step 4: Run sync/delete tests**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: sync progress and delete warning tests pass.

## Task 7: Add homepage AI scope and knowledge-base material-ingest prototype

**Files:**
- Modify: `refind-demo/src/App.jsx`
- Create or modify: `refind-demo/src/features/home/HomeComposer.jsx`
- Create or modify: `refind-demo/src/features/knowledge/MaterialIngest.jsx`
- Modify: `refind-demo/src/styles.css`
- Create or modify: focused component tests

- [ ] **Step 1: Write failing interaction tests**

Cover: default DS + online/offline in general mode; selecting a knowledge base or tag disables online and changes the scope label to strict RAG; multiple selected bases display union scope and tags display AND scope; clearing scope restores general controls. Cover the knowledge-base menu, multi-file simulated queue, card-at-list-bottom parsing progress, retained failure card with retry/delete, and automatic attachment-only downgrade after three failures.

- [ ] **Step 2: Implement deterministic UI state**

Implement no real network/upload/parser. The file chooser may use selected file names only; use timers or test-controlled transitions to present queued, parsing, ready, failed and downgraded states. Make general-mode answers omit citations and RAG-mode answers display only fixed demo citations. Preserve the current selected scope for all messages in the simulated conversation until changed or reset by new conversation.

- [ ] **Step 3: Run focused tests**

Run: `npm run test:ui -- src/features/home src/features/knowledge`

Expected: all homepage-scope and ingest state tests pass.

## Task 8: Integrate, visually QA and verify packaging

**Files:**
- Modify: `refind-demo/design-qa.md`
- Modify: `output/design.md` only if a verified visual implementation requires recording a user-approved deviation.

- [ ] **Step 1: Run all UI and Sites tests**

Run: `npm run test:ui && npm run build && npm run test:sites`

Expected: all tests pass; build emits `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

- [ ] **Step 2: Perform browser QA at desktop size**

Verify at 1920 × 1080 and 1440 × 1024: the left-aligned 1200px safe workbench, expanded and icon-only sidebar states, homepage DS/online/scope states, direct material-ingest queue, notes Tab, notebook filter before search, note title/body edit, card capture menu, card detail, selection mode, full-screen inspiration editor, collapsed material panel, generating state, citations, sync notice, and each deletion confirmation. Verify at 1024 × 768: compact two-pane layout with overlay AI/material actions. Verify at 390 × 844: navigation drawer, one visible content pane, 44px touch controls and overlay AI/material actions.

- [ ] **Step 3: Record results**

Append a dated section to `refind-demo/design-qa.md` that lists each checked path, the viewport, any adjustments made, and `final result: passed` only when no P0–P2 issue remains.

## Plan Self-Review

- Spec coverage: Tasks 2–8 cover the first-phase interaction contract; true authentication, database persistence, RAG, external AI, real file/link parsing, platform parsing and real sync retry are deliberately deferred to phase two.
- Placeholder scan: no unresolved markers; each task has concrete files, test commands and expected result.
- Type consistency: `Note`, `InspirationCard`, `createBlankNote`, `attachCards`, and `generateNoteDocument` are established in Task 1 and used by later tasks.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-09-12-refind-notes-inspiration-prototype.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
