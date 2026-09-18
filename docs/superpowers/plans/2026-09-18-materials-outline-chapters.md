# Materials Outline Chapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entering fullscreen notes with ≥2 inspiration cards auto-builds an AI chapter outline; the materials rail shows/edits chapters; generate-note writes strictly by that outline; retry-成章 uses confirm flow B when body exists.

**Architecture:** Persist `MaterialOutline` inside `notes.content.outline`. New Edge `outline-note-materials` returns chapters only (no revisions). Client reconciles outline vs bound cards on load/add/remove. `generate-note` flattens outline order (skip empty chapters) into the prompt; falls back to flat relation order when no outline. UI: chapter groups in `MaterialsPanel` with HTML5 drag + inline title edit + 「重试成章」.

**Tech Stack:** React 19 + Vite/Vitest, existing TipTap editor, Supabase Edge (Deno) + DeepSeek Chat, pure JS helpers under `refind-demo/src/features/notes/` and `supabase/functions/*/core.js`.

**Canonical design:** `docs/superpowers/specs/2026-09-18-materials-outline-chapters-design.md`

## Global Constraints

- Do not change RAG main pipeline
- Outline lives in `notes.content.outline` (no new DB column)
- 成章 ≠ 生成：outline API must not write `note_revisions` or replace body `sections`
- Generate must **preserve** existing `outline` when writing new `sections`/`text`/`blocks`
- Empty chapters skipped at generate time (no modal)
- New cards → `unassignedCardIds`; delete card removes from outline only; body unchanged
- Commit only if the user asks; no production launch in this plan
- TDD where noted; verify before claiming done
- Chinese UI copy as specified below (exact strings)

---

## File map

| File | Responsibility |
| --- | --- |
| `refind-demo/src/features/notes/materialOutline.js` | Pure outline types helpers: normalize, reconcile, flatten card order, move card, rename chapter, hasOutline |
| `refind-demo/src/features/notes/materialOutline.test.js` | Unit tests for helpers |
| `refind-demo/src/lib/api/notes.js` | Keep `outline` in `normalizeNoteContent`; add `outlineNoteMaterials(noteId)` |
| `refind-demo/src/lib/api/notes.test.js` | API / normalize tests |
| `supabase/functions/outline-note-materials/core.js` | Request parse, AI JSON → MaterialOutline, prompts |
| `supabase/functions/outline-note-materials/core.test.js` | Node tests |
| `supabase/functions/outline-note-materials/index.ts` | Auth, load cards, call DeepSeek, persist outline into content, return note |
| `supabase/functions/generate-note/core.js` | `buildPromptPayload` / messages accept chapters; `orderCardsByOutline` |
| `supabase/functions/generate-note/core.test.js` | Outline-ordered prompt tests |
| `supabase/functions/generate-note/index.ts` | Order cards by outline; merge outline into saved content |
| `refind-demo/src/features/notes/NoteEditor.jsx` | Auto-outline, chapter panel, retry dialog, generate-time read-only |
| `refind-demo/src/features/notes/NoteDialogs.jsx` | `RetryOutlineConfirmDialog` |
| `refind-demo/src/features/notes/NotesWorkspace.jsx` | `outlineFullscreenNote` + pass handlers |
| `refind-demo/src/styles/notes.css` | Chapter group styles |
| Tests for NoteEditor / NotesWorkspace / dialogs | Behavior coverage |
| Spec/plan docs under `docs/superpowers/` | Sync「按素材顺序」→「按章节大纲」 wording *(Task 9 done)* |

---

### Task 1: Outline pure helpers

**Files:**
- Create: `refind-demo/src/features/notes/materialOutline.js`
- Create: `refind-demo/src/features/notes/materialOutline.test.js`

**Interfaces:**
- Produces:
  - `emptyOutline(): MaterialOutline`
  - `normalizeOutline(value): MaterialOutline | null` — null if missing/invalid/no chapters
  - `hasSavedOutline(content): boolean`
  - `reconcileOutline(outline, boundCardIds: string[]): MaterialOutline`
  - `flattenOutlineCardIds(outline): string[]` — chapters in order, skip empty; then `unassignedCardIds`
  - `moveCardInOutline(outline, cardId, { toChapterId | 'unassigned', index }): MaterialOutline`
  - `renameChapter(outline, chapterId, title): MaterialOutline`
  - `removeCardFromOutline(outline, cardId): MaterialOutline`
  - `addCardsToUnassigned(outline, cardIds): MaterialOutline`
  - `noteHasGeneratedBody(content): boolean` — `sections.length > 0` OR non-empty trimmed `text`/`html` from a prior generate (use `Array.isArray(sections) && sections.length > 0` as primary signal matching design §6.4)

```ts
// Shape (JSDoc in file):
type MaterialOutline = {
  version: 1;
  chapters: Array<{ id: string; title: string; cardIds: string[] }>;
  unassignedCardIds: string[];
  updatedAt?: string;
};
```

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  addCardsToUnassigned,
  flattenOutlineCardIds,
  hasSavedOutline,
  moveCardInOutline,
  normalizeOutline,
  noteHasGeneratedBody,
  reconcileOutline,
  removeCardFromOutline,
  renameChapter,
} from './materialOutline.js';

describe('materialOutline', () => {
  it('normalizeOutline returns null for empty/missing', () => {
    expect(normalizeOutline(null)).toBeNull();
    expect(normalizeOutline({ version: 1, chapters: [] })).toBeNull();
  });

  it('reconcile drops unknown ids and parks missing bound ids in unassigned', () => {
    const outline = {
      version: 1,
      chapters: [{ id: 'ch1', title: '开场', cardIds: ['a', 'gone'] }],
      unassignedCardIds: ['x'],
    };
    const next = reconcileOutline(outline, ['a', 'b']);
    expect(next.chapters[0].cardIds).toEqual(['a']);
    expect(next.unassignedCardIds).toEqual(['b']);
  });

  it('flattenOutlineCardIds skips empty chapters then appends unassigned', () => {
    const ids = flattenOutlineCardIds({
      version: 1,
      chapters: [
        { id: 'c1', title: 'A', cardIds: ['a'] },
        { id: 'c2', title: 'Empty', cardIds: [] },
        { id: 'c3', title: 'B', cardIds: ['b'] },
      ],
      unassignedCardIds: ['u'],
    });
    expect(ids).toEqual(['a', 'b', 'u']);
  });

  it('move / rename / add / remove helpers keep version 1', () => {
    let o = {
      version: 1,
      chapters: [
        { id: 'c1', title: 'A', cardIds: ['a'] },
        { id: 'c2', title: 'B', cardIds: ['b'] },
      ],
      unassignedCardIds: [],
    };
    o = moveCardInOutline(o, 'a', { toChapterId: 'c2', index: 0 });
    expect(o.chapters[0].cardIds).toEqual([]);
    expect(o.chapters[1].cardIds).toEqual(['a', 'b']);
    o = renameChapter(o, 'c1', '新开场');
    expect(o.chapters[0].title).toBe('新开场');
    o = addCardsToUnassigned(o, ['n']);
    expect(o.unassignedCardIds).toEqual(['n']);
    o = removeCardFromOutline(o, 'b');
    expect(o.chapters[1].cardIds).toEqual(['a']);
  });

  it('hasSavedOutline / noteHasGeneratedBody', () => {
    expect(hasSavedOutline({ outline: { version: 1, chapters: [{ id: 'c', title: 't', cardIds: ['a'] }], unassignedCardIds: [] } })).toBe(true);
    expect(noteHasGeneratedBody({ sections: [{ type: 'paragraph', text: 'hi' }] })).toBe(true);
    expect(noteHasGeneratedBody({ sections: [], text: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd refind-demo && npm run test:ui -- src/features/notes/materialOutline.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `materialOutline.js`**

Implement the helpers above. Rules:
- `normalizeOutline`: require `version === 1`, at least one chapter object with string `id`/`title`, coerce `cardIds`/`unassignedCardIds` to unique string arrays
- `reconcileOutline`: strip ids not in `boundCardIds`; any bound id not in chapters∪unassigned → append to `unassignedCardIds`
- Never mutate inputs; always return new objects

- [ ] **Step 4: Run tests — pass**

Run: `cd refind-demo && npm run test:ui -- src/features/notes/materialOutline.test.js`  
Expected: PASS

- [ ] **Step 5: Commit** (only if user asked)

```bash
git add refind-demo/src/features/notes/materialOutline.js refind-demo/src/features/notes/materialOutline.test.js
git commit -m "feat(notes): add material outline pure helpers"
```

---

### Task 2: Persist outline in `notes.content`

**Files:**
- Modify: `refind-demo/src/lib/api/notes.js` (`normalizeNoteContent`)
- Modify: `refind-demo/src/lib/api/notes.test.js` (or create if missing coverage)
- Modify: `refind-demo/src/features/notes/noteState.js` `attachCards` to also park new ids in outline unassigned when outline exists
- Modify: `refind-demo/src/features/notes/noteState.test.js`

**Interfaces:**
- Consumes: `normalizeOutline`, `reconcileOutline`, `addCardsToUnassigned`, `removeCardFromOutline` from Task 1
- Produces: `normalizeNoteContent` keeps `outline` when valid; strips invalid outline to `undefined`

- [ ] **Step 1: Failing test** in `notes.test.js`

```js
import { normalizeNoteContent } from './notes.js';

test('normalizeNoteContent preserves valid outline and drops invalid', () => {
  const withOutline = normalizeNoteContent({
    text: '',
    sections: [],
    outline: {
      version: 1,
      chapters: [{ id: 'ch1', title: '开场', cardIds: ['a'] }],
      unassignedCardIds: [],
    },
  });
  expect(withOutline.outline.chapters[0].title).toBe('开场');

  const bad = normalizeNoteContent({ text: '', outline: { version: 2, chapters: [] } });
  expect(bad.outline).toBeUndefined();
});
```

- [ ] **Step 2: Run — fail** (outline not preserved / not validated)

- [ ] **Step 3: Implement**

In `normalizeNoteContent`:

```js
import { normalizeOutline } from '../../features/notes/materialOutline.js';

export function normalizeNoteContent(content) {
  const value = content && typeof content === 'object' && !Array.isArray(content) ? content : {};
  const outline = normalizeOutline(value.outline);
  const next = {
    ...value,
    text: typeof value.text === 'string' ? value.text : '',
    blocks: Array.isArray(value.blocks) ? value.blocks : [],
    sections: Array.isArray(value.sections) ? value.sections : [],
  };
  if (outline) next.outline = outline;
  else delete next.outline;
  return next;
}
```

Update `attachCards` in `noteState.js`:

```js
import { addCardsToUnassigned, normalizeOutline } from './materialOutline.js';

export function attachCards(note, cardIds) {
  const added = cardIds.filter((id) => !note.inspirationCardIds.includes(id));
  const inspirationCardIds = [...note.inspirationCardIds, ...added];
  const outline = normalizeOutline(note.content?.outline);
  if (!outline || !added.length) {
    return { ...note, inspirationCardIds };
  }
  return {
    ...note,
    inspirationCardIds,
    content: {
      ...note.content,
      outline: addCardsToUnassigned(outline, added),
    },
  };
}
```

When removing a card in `NoteEditor` (Task 5 wires UI), call `removeCardFromOutline` and persist content+materials together.

- [ ] **Step 4: Tests pass**

Run: `cd refind-demo && npm run test:ui -- src/lib/api/notes.test.js src/features/notes/noteState.test.js`

- [ ] **Step 5: Commit** (if asked)

---

### Task 3: Edge `outline-note-materials`

**Files:**
- Create: `supabase/functions/outline-note-materials/core.js`
- Create: `supabase/functions/outline-note-materials/core.test.js`
- Create: `supabase/functions/outline-note-materials/index.ts`

**Interfaces:**
- Consumes: same auth/card load pattern as `generate-note/index.ts`
- Produces: HTTP POST body `{ noteId }` → updates `notes.content.outline` only → returns mapped note row (same select shape as generate-note)
- Pure: `normalizeOutlineRequestBody`, `parseOutlineAiJson`, `buildOutlineMessages`, `buildOutlineFromAi(ai, cardIds)`

- [ ] **Step 1: Failing core tests** (`node:test`, mirror generate-note)

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOutlineFromAi,
  normalizeOutlineRequestBody,
  parseOutlineAiJson,
} from './core.js';

test('normalizeOutlineRequestBody requires noteId', () => {
  assert.throws(() => normalizeOutlineRequestBody({}), /noteId/);
});

test('parseOutlineAiJson requires chapters array', () => {
  const parsed = parseOutlineAiJson('{"chapters":[{"title":"开场","cardIds":["a"]}]}');
  assert.equal(parsed.chapters[0].title, '开场');
});

test('buildOutlineFromAi assigns stable chapter ids and parks leftover cards', () => {
  const outline = buildOutlineFromAi(
    { chapters: [{ title: '动机', cardIds: ['a'] }, { title: '方法', cardIds: ['b'] }] },
    ['a', 'b', 'c'],
  );
  assert.equal(outline.version, 1);
  assert.equal(outline.chapters.length, 2);
  assert.deepEqual(outline.chapters[0].cardIds, ['a']);
  assert.deepEqual(outline.unassignedCardIds, ['c']);
  assert.ok(outline.chapters[0].id);
});
```

- [ ] **Step 2: Run — fail**

Run: `cd supabase/functions/outline-note-materials && node --test core.test.js`  
Expected: FAIL module not found

- [ ] **Step 3: Implement `core.js`**

Prompt rules (system):
- 只输出 JSON：`{"chapters":[{"title":"...","cardIds":["..."]}]}`
- 目标 3～5 章（允许 2～6）；每张输入卡最多出现一次；勿编造 cardId
- 用卡片内容语义聚类成叙事顺序，不要按收藏时间

`buildOutlineFromAi`:
- Filter cardIds to known set; drop unknown; dedupe
- Generate `id` as `ch-${index + 1}` or `crypto.randomUUID()`-style string stable per response index
- Any input cardId not placed → `unassignedCardIds`
- If model returns 0 chapters, throw

- [ ] **Step 4: Implement `index.ts`**

Mirror `generate-note/index.ts` auth + card load. Differences:
- Do **not** insert `note_revisions`
- Build messages from cards (≥2 required; if <2 return 400 `至少需要 2 张灵感卡片才能成章`)
- After AI: `const nextContent = { ...normalizeNoteContent(note.content), outline }` — preserve text/sections/blocks/html
- `update notes set content = nextContent`
- Return updated note with relations select

- [ ] **Step 5: Core tests pass**

Run: `node --test supabase/functions/outline-note-materials/core.test.js`

- [ ] **Step 6: Commit** (if asked)

---

### Task 4: Client `outlineNoteMaterials` + workspace handler

**Files:**
- Modify: `refind-demo/src/lib/api/notes.js`
- Modify: `refind-demo/src/lib/api/notes.test.js`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- Produces: `outlineNoteMaterials(noteId): Promise<Note>` via `supabase.functions.invoke('outline-note-materials', { body: { noteId } })`
- Produces: `outlineFullscreenNote` in workspace (same merge pattern as `generateFullscreenNote` for local materials)

- [ ] **Step 1: Failing test** — mock invoke called with function name `outline-note-materials` and `{ noteId }`

```js
test('outlineNoteMaterials invokes outline-note-materials edge', async () => {
  // mock supabase.functions.invoke → resolve mapNote-shaped payload
  await outlineNoteMaterials('note-1');
  expect(invoke).toHaveBeenCalledWith('outline-note-materials', { body: { noteId: 'note-1' } });
});
```

- [ ] **Step 2: Implement client + workspace**

```js
export async function outlineNoteMaterials(noteId) {
  const id = typeof noteId === 'string' ? noteId.trim() : '';
  if (!id) throw new Error('noteId is required');
  const { data, error } = await supabase.functions.invoke('outline-note-materials', {
    body: { noteId: id },
  });
  if (error) throw new Error(await readFunctionError(error, data, '成章失败，请稍后重试。'));
  if (data?.error) throw new Error(String(data.error));
  if (!data || typeof data !== 'object') throw new Error('成章返回为空');
  return mapNote(data);
}
```

In `NotesWorkspace.jsx`, add `outlineFullscreenNote` analogous to generate; pass `onOutline={outlineFullscreenNote}` to fullscreen `NoteEditor`.

- [ ] **Step 3: Tests pass**

- [ ] **Step 4: Commit** (if asked)

---

### Task 5: Chapter MaterialsPanel UI + outline mutations

**Files:**
- Modify: `refind-demo/src/features/notes/NoteEditor.jsx` (`MaterialsPanel` → chapter-aware)
- Modify: `refind-demo/src/styles/notes.css`
- Create/Modify: `refind-demo/src/features/notes/NoteEditor.outline.test.jsx` (or extend existing)

**Interfaces:**
- Consumes: outline helpers; `note.content.outline`
- Produces: panel renders chapters + 「未归章」; callbacks update `content.outline` via `commit` + persist title/content path; also sync flat `inspirationCardIds` = `flattenOutlineCardIds(outline)` when outline exists (so materials RPC sort_order matches narrative)

UI requirements:
- Chapter title: contenteditable or `<input className="materials-rail__chapter-title">`
- Cards under chapter with chapter-local index
- HTML5 drag: `draggable` on card; drop on chapter list / card slot; call `moveCardInOutline`
- Fallback: keep ▲▼ for within-chapter when drag awkward on touch (optional but keep if cheap)
- Header actions: show「重试成章」button (wired in Task 6/7)
- `readOnly` prop when `generating || outlining` — disable drag, title edit, add/remove, reorder

Copy:
- Eyebrow can stay「写作素材」; h2 → `章节大纲` when outline present, else `已选灵感卡片`
- Unassigned section title: `未归章`

- [ ] **Step 1: Failing component test**

```jsx
it('renders chapter titles and parks unassigned cards', () => {
  render(
    <NoteEditor
      mode="inspiration"
      showMaterials
      note={{
        id: 'n1',
        title: 't',
        inspirationCardIds: ['a', 'b', 'c'],
        materialThoughts: {},
        content: {
          text: '',
          sections: [],
          outline: {
            version: 1,
            chapters: [{ id: 'ch1', title: '动机', cardIds: ['a'] }],
            unassignedCardIds: ['b', 'c'],
          },
        },
      }}
      cards={[
        { id: 'a', contentSnapshot: 'A', answerMode: 'general' },
        { id: 'b', contentSnapshot: 'B', answerMode: 'general' },
        { id: 'c', contentSnapshot: 'C', answerMode: 'general' },
      ]}
    />,
  );
  expect(screen.getByDisplayValue('动机')).toBeInTheDocument();
  expect(screen.getByText('未归章')).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement panel**

When `normalizeOutline(note.content.outline)` is null → keep today’s flat list (compat).

`removeCard`:
```js
const removeCard = (cardId) => {
  const outline = normalizeOutline(note.content?.outline);
  const inspirationCardIds = note.inspirationCardIds.filter((id) => id !== cardId);
  if (!outline) {
    commit({ inspirationCardIds });
    return;
  }
  commit({
    inspirationCardIds,
    content: {
      ...note.content,
      outline: removeCardFromOutline(outline, cardId),
    },
  });
};
```

Ensure `commit` triggers `onPersist` when `content` changes (already does) **and** `onMaterialsChange` when ids change.

- [ ] **Step 3: CSS** — `.materials-rail__chapter`, title input, unassigned block; no purple/glow; match existing neutral materials rail

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit** (if asked)

---

### Task 6: Auto-outline on enter fullscreen

**Files:**
- Modify: `refind-demo/src/features/notes/NoteEditor.jsx`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx` / NoteEditor tests

**Interfaces:**
- Consumes: `onOutline`, `hasSavedOutline`, card count
- Behavior per design §5

- [ ] **Step 1: Failing test** — mount fullscreen note with 2 cards, no outline → `onOutline` called once

```jsx
it('auto-outlines when entering inspiration edit with ≥2 cards and no outline', async () => {
  const onOutline = vi.fn().mockResolvedValue(undefined);
  render(<NoteEditor mode="inspiration" showMaterials note={noteTwoCardsNoOutline} cards={cards} onOutline={onOutline} onChange={() => {}} />);
  await waitFor(() => expect(onOutline).toHaveBeenCalledTimes(1));
});

it('does not auto-outline when outline already saved', async () => {
  const onOutline = vi.fn();
  render(<NoteEditor mode="inspiration" showMaterials note={noteWithOutline} cards={cards} onOutline={onOutline} onChange={() => {}} />);
  await waitFor(() => expect(onOutline).not.toHaveBeenCalled());
});
```

- [ ] **Step 2: Implement effect**

```js
const [outlining, setOutlining] = useState(false);
const [outlineError, setOutlineError] = useState(null);
const autoOutlineAttemptedRef = useRef(null);

useEffect(() => {
  if (!isFullscreen || !materialsEnabled) return;
  if (autoOutlineAttemptedRef.current === note.id) return;
  const bound = note.inspirationCardIds?.length ?? 0;
  if (bound < 2) return;
  if (hasSavedOutline(note.content)) return;
  if (!onOutline) return;
  autoOutlineAttemptedRef.current = note.id;
  let cancelled = false;
  (async () => {
    setOutlining(true);
    setOutlineError(null);
    try {
      await onOutline();
    } catch {
      if (!cancelled) setOutlineError('成章失败，可重试');
    } finally {
      if (!cancelled) setOutlining(false);
    }
  })();
  return () => { cancelled = true; };
}, [note.id, isFullscreen, materialsEnabled]); // intentionally do not re-fire on card churn mid-session
```

Panel: when `outlining`, show skeleton/placeholder text `成章中…` (non-blocking; back button still works).

On failure: flat list + visible「重试成章」.

Reset `autoOutlineAttemptedRef` when `note.id` changes (effect above handles via comparison).

- [ ] **Step 3: Tests pass**

- [ ] **Step 4: Commit** (if asked)

---

### Task 7: Retry-成章 confirm flow B

**Files:**
- Modify: `refind-demo/src/features/notes/NoteDialogs.jsx`
- Create: `refind-demo/src/features/notes/NoteDialogs.retryOutline.test.jsx`
- Modify: `NoteEditor.jsx`

**Interfaces:**
- Produces: `RetryOutlineConfirmDialog` with actions:
  - `仅更新结构` → close, keep body
  - `更新并重新生成` → close, then call `onGenerate`
- Copy exact:
  - Title/body: `结构已更新，是否用新结构重新生成正文？`
  - Buttons: `仅更新结构` / `更新并重新生成`

- [ ] **Step 1: Failing dialog test** — click each button fires correct callback once

- [ ] **Step 2: Implement retry handler in NoteEditor**

```js
const handleRetryOutline = async () => {
  if (outlining || generating || !onOutline) return;
  setOutlining(true);
  setOutlineError(null);
  try {
    await onOutline();
    if (noteHasGeneratedBody(note.content)) {
      setRetryConfirmOpen(true); // dialog after structure updated
    }
  } catch {
    setOutlineError('成章失败，可重试');
  } finally {
    setOutlining(false);
  }
};
```

When user picks「更新并重新生成」, call existing `generate()`.

No dialog when `!noteHasGeneratedBody`.

- [ ] **Step 3: Tests pass**

- [ ] **Step 4: Commit** (if asked)

---

### Task 8: `generate-note` respects outline

**Files:**
- Modify: `supabase/functions/generate-note/core.js`
- Modify: `supabase/functions/generate-note/core.test.js`
- Modify: `supabase/functions/generate-note/index.ts`
- Modify: `refind-demo/src/features/notes/noteState.js` `generateNoteDocument` (demo fallback) to honor outline order when present

**Interfaces:**
- Produces:
  - `orderCardsByOutline(cards, outline): cards[]` — flatten; if no outline, preserve input order
  - `buildPromptPayload({ title, cards, chapters })` — when chapters provided, payload includes `chapters: [{ title, cards: [...] }]` and omits flat-only ambiguity
  - `buildGenerateMessages` — instruct model to follow chapter order; skip empty; write section flow per chapter

- [ ] **Step 1: Failing tests**

```js
test('orderCardsByOutline follows chapters then unassigned', () => {
  const cards = [{ id: 'b' }, { id: 'a' }, { id: 'u' }];
  const ordered = orderCardsByOutline(cards, {
    version: 1,
    chapters: [
      { id: 'c1', title: '一', cardIds: ['a'] },
      { id: 'c2', title: '二', cardIds: [] },
      { id: 'c3', title: '三', cardIds: ['b'] },
    ],
    unassignedCardIds: ['u'],
  });
  assert.deepEqual(ordered.map((c) => c.id), ['a', 'b', 'u']);
});

test('buildPromptPayload includes chapters when provided', () => {
  const payload = buildPromptPayload({
    title: 't',
    chapters: [{ title: '动机', cards: [{ id: 'a', /* ... */ }] }],
  });
  assert.equal(payload.chapters[0].title, '动机');
});
```

- [ ] **Step 2: Implement core + index**

In `index.ts` after loading cards:

```js
const currentContent = normalizeNoteContent(note.content);
const outline = currentContent.outline; // ensure generate-note normalizeNoteContent also preserves outline (copy helper logic or share)
const orderedCards = orderCardsByOutline(cards, outline);
const chapters = outline?.chapters
  ?.filter((ch) => ch.cardIds?.length)
  .map((ch) => ({
    title: ch.title,
    cards: ch.cardIds.map((id) => orderedCards.find((c) => c.id === id)).filter(Boolean),
  }));
const promptPayload = buildPromptPayload({
  title: note.title,
  cards: orderedCards,
  chapters: chapters?.length ? chapters : undefined,
});
```

When saving:

```js
const generated = buildNoteContentFromAi(aiJson, orderedCards);
const nextContent = {
  ...generated,
  outline: currentContent.outline, // CRITICAL: do not drop outline
  html: undefined, // or omit; match prior behavior
};
```

Also update Edge `normalizeNoteContent` in generate-note/core.js to preserve `outline` the same way as client (duplicate small normalize or import if bundling allows — prefer duplicated minimal preserve in Edge core to avoid cross-package imports).

System prompt additions when chapters present:
- 按 chapters 数组顺序写作；每章先写过渡/小标题语义再展开该章 cards
- 不要使用未出现的 cardId
- 无 chapters 时保持旧扁平规则（兼容）

- [ ] **Step 3: Tests pass** (`node --test supabase/functions/generate-note/core.test.js`)

- [ ] **Step 4: Deploy** both functions when ready for QA:

```bash
supabase functions deploy outline-note-materials --project-ref ngrerfmwxsdothniuorb
supabase functions deploy generate-note --project-ref ngrerfmwxsdothniuorb
```

- [ ] **Step 5: Commit** (if asked)

---

### Task 9: Docs sync + acceptance checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-notes-intelligence-design.md` (and/or plan) — replace「按素材顺序生成」with「按章节大纲顺序生成；无大纲时回退扁平素材顺序」
- Modify: this feature’s design status line if needed

- [x] **Step 1: Grep** for `素材顺序` / `inspirationCardIds` generate wording in docs; update hits that claim order is metadata/collection order for generation

- [x] **Step 2: Manual acceptance** (design §10) — checklist ticked in spec; *manual QA pending*

| # | Check |
| --- | --- |
| 1 | ≥2 cards first fullscreen → auto outline → chapter panel |
| 2 | Drag across chapters → generate → body follows structure |
| 3 | Retry without body: no dialog; with body: dialog; 仅更新结构 keeps body |
| 4 | 更新并重新生成 changes body + revision |
| 5 | New card → 未归章; delete card does not change body |
| 6 | Outline failure → retry, editor still usable |
| 7 | During generate, panel read-only |

- [x] **Step 3: Commit docs** (if asked)

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| §5 Auto-outline on enter ≥2, no saved outline | Task 6 |
| §6.1 Chapter display + title edit | Task 5 |
| §6.2 Drag within/across; skip empty on generate | Tasks 5 + 8 |
| §6.3 Add → unassigned; delete body untouched | Tasks 2 + 5 |
| §6.4 Retry B confirm | Task 7 |
| §6.5 Generate-time panel read-only | Task 5 (`readOnly`) |
| §7 Generate by outline; flat fallback | Task 8 |
| §8 Data model in content.outline | Tasks 1–2 |
| §9 outline API no revisions | Task 3 |
| §10 Acceptance | Task 9 |
| §12 Docs sync | Task 9 |

No placeholders left. Types consistent: `MaterialOutline.version: 1`, `unassignedCardIds`, `flattenOutlineCardIds` / `orderCardsByOutline`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-18-materials-outline-chapters.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
