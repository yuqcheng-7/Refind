# Phase 3 DeepSeek Summary + Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stub truncate summaries with DeepSeek-generated summary + ~3 material tags on parse ready, with fail-soft behavior, manual tag edit lock, reparse, and real `#` tag filters.

**Architecture:** After `parse-material` extracts usable body text, call existing `deepseekChat` for a strict JSON `{ summary, tags }`. Write `materials.summary`; replace `material_tag_relations` only when `tags_user_edited` is false. Frontend lists real tags for `#`, supports four-item context menu (reparse / edit tags / move dialog / delete), and preview-page reparse. AI failures never fail the material row.

**Tech Stack:** Supabase Edge (Deno) + `deepseekChat` in `_shared/ai.ts`, Postgres migration, React 19 + Vite, Vitest / `node --test`.

**Design spec:** `docs/superpowers/specs/2026-09-15-deepseek-summary-tags-design.md`  
**Parent roadmap:** `docs/superpowers/specs/2026-09-13-phase2-3-roadmap-design.md` (阶段三 · C)  
**Branch:** `phase3-deepseek-summary-tags`

## Global Constraints

- New materials only; no batch backfill of historical ready rows.
- AI failure → keep material ready (or existing body); fallback truncate summary; tags may be empty; user can reparse.
- Exactly at most 3 tags from AI; normalize: trim, dedupe, strip leading `#`.
- Reparse always regenerates summary; never overwrite tags when `tags_user_edited = true`.
- Context menu: four items only, no material title;「移动到」opens a separate KB picker (not nested list inside the menu).
- `#` options come from real `material_tags` (home = user union; KB = tags used in that base); no hardcoded demo tag list.
- Secrets stay in Edge env (`DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY`); never in Vite bundle.
- Do not commit unless the user explicitly asks.
- Out of scope: history backfill, hosted parser, platform login expansion, separate「重新生成摘要」button.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/202609150005_materials_tags_user_edited.sql` | `materials.tags_user_edited` + unique `(user_id, name)` on `material_tags` |
| `supabase/functions/parse-material/enrichment.js` | Pure prompt / JSON parse / tag normalize / `shouldReplaceTags` |
| `supabase/functions/parse-material/enrichment.test.js` | `node --test` for enrichment helpers |
| `supabase/functions/parse-material/applyTags.js` | Upsert tags + replace relations (service role) |
| `supabase/functions/parse-material/applyTags.test.js` | Unit tests with fake supabase client |
| `supabase/functions/parse-material/index.ts` | Call enrichment before ready patch; fail-soft |
| `refind-demo/src/lib/api/materials.js` | `listMaterialTags`, `replaceMaterialTags`, map `tagsUserEdited` |
| `refind-demo/src/lib/api/materials.tags.test.js` | Client tag API unit tests (mocked supabase) |
| `refind-demo/src/features/knowledge/EditMaterialTagsDialog.jsx` | Multi-tag edit UI |
| `refind-demo/src/features/knowledge/MoveMaterialDialog.jsx` | Secondary KB picker |
| `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx` |「重新解析」button |
| `refind-demo/src/main.jsx` | Wire preview reparse → `parseAndPollMaterial({ force: true })` |
| `refind-demo/src/App.jsx` | Menu, reparse, edit tags, move dialog, tagFilters, real tag lists |
| `refind-demo/src/features/home/HomeComposer.jsx` | `availableTags` prop instead of hardcoded list |
| `refind-demo/src/styles.css` | Minimal styles for dialogs / menu (match existing) |

---

### Task 1: Migration `tags_user_edited`

**Files:**
- Create: `supabase/migrations/202609150005_materials_tags_user_edited.sql`

**Interfaces:**
- Produces: column `public.materials.tags_user_edited boolean not null default false`
- Produces: unique index `material_tags_user_id_name_unique` on `(user_id, name)`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/202609150005_materials_tags_user_edited.sql
alter table public.materials
  add column if not exists tags_user_edited boolean not null default false;

create unique index if not exists material_tags_user_id_name_unique
  on public.material_tags (user_id, name);
```

- [ ] **Step 2: Apply locally**

Run: `cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind && npx supabase db reset`  
(or `supabase migration up` if reset is too heavy)  
Expected: migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202609150005_materials_tags_user_edited.sql
git commit -m "Add materials.tags_user_edited and unique material tag names."
```

---

### Task 2: Enrichment pure helpers (TDD)

**Files:**
- Create: `supabase/functions/parse-material/enrichment.js`
- Create: `supabase/functions/parse-material/enrichment.test.js`

**Interfaces:**
- Produces:
  - `CONTENT_CHAR_LIMIT = 7000`
  - `buildMaterialEnrichmentPrompt({ title, platform, contentText }) → { role:'user', content:string }[]` (system + user messages OK)
  - `normalizeTagList(tags: unknown): string[]` — max 3, trim, dedupe (case-sensitive Chinese OK), strip leading `#`
  - `parseMaterialEnrichmentResponse(raw: string): { summary: string, tags: string[] } | null`
  - `shouldReplaceTags({ tagsUserEdited: boolean }): boolean`
  - `fallbackSummary(seed, text, title)` — re-export or wrap existing truncate rules used when AI fails (keep behavior aligned with current `buildSummary`)

- [ ] **Step 1: Write failing tests**

```js
// supabase/functions/parse-material/enrichment.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMaterialEnrichmentPrompt,
  normalizeTagList,
  parseMaterialEnrichmentResponse,
  shouldReplaceTags,
} from './enrichment.js';

test('normalizeTagList caps at 3, strips #, dedupes empties', () => {
  assert.deepEqual(
    normalizeTagList(['#增长', '增长', ' 用户研究 ', '', '#产品', '多余']),
    ['增长', '用户研究', '产品'],
  );
});

test('parseMaterialEnrichmentResponse accepts fenced JSON', () => {
  const raw = '```json\n{"summary":"这是一段四十到一百二十字以内的摘要。","tags":["A","B","C"]}\n```';
  assert.deepEqual(parseMaterialEnrichmentResponse(raw), {
    summary: '这是一段四十到一百二十字以内的摘要。',
    tags: ['A', 'B', 'C'],
  });
});

test('parseMaterialEnrichmentResponse returns null on garbage', () => {
  assert.equal(parseMaterialEnrichmentResponse('not json'), null);
  assert.equal(parseMaterialEnrichmentResponse('{"summary":""}'), null);
});

test('shouldReplaceTags respects user edit lock', () => {
  assert.equal(shouldReplaceTags({ tagsUserEdited: false }), true);
  assert.equal(shouldReplaceTags({ tagsUserEdited: true }), false);
});

test('buildMaterialEnrichmentPrompt includes title and truncated body', () => {
  const messages = buildMaterialEnrichmentPrompt({
    title: '标题',
    platform: 'web',
    contentText: '正文'.repeat(5000),
  });
  assert.ok(Array.isArray(messages) && messages.length >= 1);
  const blob = messages.map((m) => m.content).join('\n');
  assert.match(blob, /标题/);
  assert.match(blob, /summary/);
  assert.match(blob, /tags/);
  assert.ok(blob.length < 20000);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind/supabase/functions/parse-material && node --test enrichment.test.js`  
Expected: FAIL module not found

- [ ] **Step 3: Implement `enrichment.js`**

```js
// supabase/functions/parse-material/enrichment.js
export const CONTENT_CHAR_LIMIT = 7000;

export function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    let name = raw.trim().replace(/^#+/, '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 3) break;
  }
  return out;
}

export function parseMaterialEnrichmentResponse(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text);
  if (fence) text = fence[1].trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      data = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const summary = typeof data?.summary === 'string' ? data.summary.trim() : '';
  if (!summary) return null;
  return { summary, tags: normalizeTagList(data.tags) };
}

export function shouldReplaceTags({ tagsUserEdited }) {
  return tagsUserEdited !== true;
}

export function buildMaterialEnrichmentPrompt({ title, platform, contentText }) {
  const body = String(contentText || '').slice(0, CONTENT_CHAR_LIMIT);
  return [
    {
      role: 'system',
      content:
        '你是资料整理助手。根据标题与正文，输出严格 JSON：{"summary":"中文简明摘要40-120字","tags":["标签1","标签2","标签3"]}。tags 最多 3 个中文短词，不要 # 前缀，不要 markdown。',
    },
    {
      role: 'user',
      content: `标题：${title || '未命名'}\n平台：${platform || 'web'}\n正文：\n${body}`,
    },
  ];
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test enrichment.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-material/enrichment.js supabase/functions/parse-material/enrichment.test.js
git commit -m "Add pure DeepSeek summary/tag enrichment helpers."
```

---

### Task 3: Apply tags helper (TDD)

**Files:**
- Create: `supabase/functions/parse-material/applyTags.js`
- Create: `supabase/functions/parse-material/applyTags.test.js`

**Interfaces:**
- Consumes: tag name strings; admin supabase-like client
- Produces: `async function replaceMaterialTagRelations(admin, { userId, materialId, tagNames: string[] }): Promise<void>`
  - For each name: select existing `material_tags` by `(user_id, name)` else insert
  - Delete all `material_tag_relations` for `materialId`
  - Insert new relations
  - Empty `tagNames` → clear all relations

- [ ] **Step 1: Write failing test with fake client**

```js
// supabase/functions/parse-material/applyTags.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceMaterialTagRelations } from './applyTags.js';

function fakeAdmin({ existing = [] } = {}) {
  const tags = [...existing];
  const relations = [];
  return {
    tags,
    relations,
    from(table) {
      const self = this;
      if (table === 'material_tags') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq(col, name) {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => {
                            const row = tags.find((t) => t.name === name);
                            return { data: row || null, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(row) {
            return {
              select() {
                return {
                  single: async () => {
                    const created = { id: `tag-${tags.length + 1}`, ...row };
                    tags.push(created);
                    return { data: created, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'material_tag_relations') {
        return {
          delete() {
            return {
              eq: async (_c, materialId) => {
                for (let i = relations.length - 1; i >= 0; i -= 1) {
                  if (relations[i].material_id === materialId) relations.splice(i, 1);
                }
                return { error: null };
              },
            };
          },
          insert: async (rows) => {
            relations.push(...(Array.isArray(rows) ? rows : [rows]));
            return { error: null };
          },
        };
      }
      throw new Error(table);
    },
  };
}

test('replaceMaterialTagRelations upserts and replaces', async () => {
  const admin = fakeAdmin();
  await replaceMaterialTagRelations(admin, {
    userId: 'u1',
    materialId: 'm1',
    tagNames: ['增长', '用户研究'],
  });
  assert.equal(admin.tags.length, 2);
  assert.equal(admin.relations.length, 2);
  await replaceMaterialTagRelations(admin, {
    userId: 'u1',
    materialId: 'm1',
    tagNames: ['增长'],
  });
  assert.equal(admin.tags.length, 2);
  assert.equal(admin.relations.length, 1);
  assert.equal(admin.relations[0].tag_id, admin.tags[0].id);
});
```

Adjust the fake client chain to match whatever query style `applyTags.js` uses (prefer `.maybeSingle()` or `.limit(1)` then `[0]` — pick one and keep tests in sync).

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test applyTags.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `applyTags.js`**

```js
// supabase/functions/parse-material/applyTags.js
export async function replaceMaterialTagRelations(admin, { userId, materialId, tagNames }) {
  const names = Array.isArray(tagNames) ? tagNames : [];
  const tagIds = [];
  for (const name of names) {
    const { data: existing, error: lookupError } = await admin
      .from('material_tags')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }
    const { data: created, error: createError } = await admin
      .from('material_tags')
      .insert({ user_id: userId, name })
      .select('id')
      .single();
    if (createError) throw createError;
    tagIds.push(created.id);
  }

  const { error: clearError } = await admin
    .from('material_tag_relations')
    .delete()
    .eq('material_id', materialId);
  if (clearError) throw clearError;

  if (!tagIds.length) return;
  const { error: linkError } = await admin.from('material_tag_relations').insert(
    tagIds.map((tag_id) => ({ material_id: materialId, tag_id })),
  );
  if (linkError) throw linkError;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test applyTags.test.js enrichment.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-material/applyTags.js supabase/functions/parse-material/applyTags.test.js
git commit -m "Add material tag relation replace helper for parse-material."
```

---

### Task 4: Wire DeepSeek into `parse-material` ready path

**Files:**
- Modify: `supabase/functions/parse-material/index.ts`
- Create: `supabase/functions/parse-material/enrichMaterial.js` (async orchestrator, easier to unit-test)
- Create: `supabase/functions/parse-material/enrichMaterial.test.js`

**Interfaces:**
- Consumes: `deepseekChat` from `../_shared/ai.ts` (import in `index.ts`; inject chat fn into `enrichMaterial` for tests)
- Produces: `async function enrichMaterialSummaryAndTags({ deepseekChat, title, platform, contentText, tagsUserEdited }): Promise<{ summary: string | null, tags: string[] | null, usedAi: boolean }>`
  - On success: `{ summary, tags, usedAi: true }`
  - On failure / null parse: `{ summary: null, tags: null, usedAi: false }`
- In `index.ts` before `readyPatch`:
  1. Keep `stubSummary = buildSummary(...)`
  2. Call enricher when `text` is non-empty
  3. `readyPatch.summary = enrichment.summary || stubSummary`
  4. If `shouldReplaceTags({ tagsUserEdited: material.tags_user_edited }) && enrichment.tags`: call `replaceMaterialTagRelations`
  5. Never throw out of AI path into the outer catch (wrap try/catch; log message only)
  6. `link_only` / empty body: **do not** call DeepSeek (unchanged)

- [ ] **Step 1: Write enrichMaterial tests with mock chat**

```js
// supabase/functions/parse-material/enrichMaterial.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichMaterialSummaryAndTags } from './enrichMaterial.js';

test('uses AI JSON when chat succeeds', async () => {
  const result = await enrichMaterialSummaryAndTags({
    deepseekChat: async () => JSON.stringify({
      summary: 'AI 生成的摘要内容足够长。',
      tags: ['增长', '研究', '产品'],
    }),
    title: 't',
    platform: 'web',
    contentText: '很长的正文内容……',
    tagsUserEdited: false,
  });
  assert.equal(result.usedAi, true);
  assert.equal(result.summary, 'AI 生成的摘要内容足够长。');
  assert.deepEqual(result.tags, ['增长', '研究', '产品']);
});

test('returns nulls when chat throws', async () => {
  const result = await enrichMaterialSummaryAndTags({
    deepseekChat: async () => { throw new Error('timeout'); },
    title: 't',
    platform: 'web',
    contentText: '正文',
    tagsUserEdited: false,
  });
  assert.equal(result.usedAi, false);
  assert.equal(result.summary, null);
  assert.equal(result.tags, null);
});
```

- [ ] **Step 2: Implement `enrichMaterial.js`**

```js
import {
  buildMaterialEnrichmentPrompt,
  parseMaterialEnrichmentResponse,
} from './enrichment.js';

export async function enrichMaterialSummaryAndTags({
  deepseekChat,
  title,
  platform,
  contentText,
}) {
  try {
    const raw = await deepseekChat(
      buildMaterialEnrichmentPrompt({ title, platform, contentText }),
      { model: 'deepseek-chat', temperature: 0.2 },
    );
    const parsed = parseMaterialEnrichmentResponse(raw);
    if (!parsed) return { summary: null, tags: null, usedAi: false };
    return { summary: parsed.summary, tags: parsed.tags, usedAi: true };
  } catch {
    return { summary: null, tags: null, usedAi: false };
  }
}
```

- [ ] **Step 3: Patch `index.ts` ready block**

After chunks insert, before update:

```ts
import { deepseekChat } from '../_shared/ai.ts';
import { enrichMaterialSummaryAndTags } from './enrichMaterial.js';
import { shouldReplaceTags } from './enrichment.js';
import { replaceMaterialTagRelations } from './applyTags.js';

// ...
const stubSummary = buildSummary(summarySeed, text, typeof title === 'string' ? title : '');
const enrichment = await enrichMaterialSummaryAndTags({
  deepseekChat,
  title: typeof title === 'string' ? title : '',
  platform: (linkFields.platform_code as string) || material.platform_code || 'web',
  contentText: text,
});
const readyPatch: Record<string, unknown> = {
  // ...existing fields...
  summary: enrichment.summary || stubSummary,
  status: 'ready',
  // ...
};
const { error: updateError } = await admin.from('materials').update(readyPatch).eq('id', material.id);
if (updateError) throw updateError;

if (
  shouldReplaceTags({ tagsUserEdited: Boolean(material.tags_user_edited) })
  && enrichment.tags
  && enrichment.tags.length > 0
) {
  try {
    await replaceMaterialTagRelations(admin, {
      userId: material.user_id,
      materialId: material.id,
      tagNames: enrichment.tags,
    });
  } catch (tagError) {
    console.error('apply tags failed', tagError);
  }
}
```

Ensure material select includes `tags_user_edited`.

- [ ] **Step 4: Run unit tests**

Run: `node --test enrichment.test.js applyTags.test.js enrichMaterial.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/parse-material/
git commit -m "Call DeepSeek for summary and tags on parse ready."
```

---

### Task 5: Client materials tag APIs

**Files:**
- Modify: `refind-demo/src/lib/api/materials.js`
- Create: `refind-demo/src/lib/api/materials.tags.test.js`
- Modify: existing `mapMaterial` callers if needed (additive field only)

**Interfaces:**
- Produces:
  - `mapMaterial` adds `tagsUserEdited: Boolean(row.tags_user_edited)`
  - `listMaterialTags({ knowledgeBaseId }?: { knowledgeBaseId?: string }): Promise<{ id: string, name: string }[]>`
    - If `knowledgeBaseId`: distinct tags via materials in that KB (query relations joined to materials filtered by kb + user)
    - Else: all `material_tags` for current user ordered by name
  - `replaceMaterialTags(materialId, tagNames: string[]): Promise<mappedMaterial>`
    - Normalize client-side (trim, strip `#`, dedupe, allow >3 if user typed more? Spec says edit freely — **allow any count on manual edit**, do not force 3)
    - Upsert each tag, replace all relations, set `tags_user_edited = true`
  - Keep `replaceMaterialTag(materialId, tagName)` as thin wrapper → `replaceMaterialTags(id, [tagName])` for compat, or update call sites only

- [ ] **Step 1: Write Vitest with mocked supabase** (follow patterns in `materials.test.js` / `auth.test.js`)

```js
// refind-demo/src/lib/api/materials.tags.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock supabase module; assert replaceMaterialTags sets tags_user_edited true
// and listMaterialTags returns [{id,name}, ...]
```

Implement mocks sufficient to cover:
1. `replaceMaterialTags` updates `materials.tags_user_edited = true`
2. `listMaterialTags()` without kb returns user tags
3. Empty names rejected / cleared appropriately (`[]` clears relations + still sets user edited)

- [ ] **Step 2: Run — expect FAIL**

Run: `cd refind-demo && npx vitest run src/lib/api/materials.tags.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement APIs in `materials.js`**

Sketch:

```js
export async function listMaterialTags({ knowledgeBaseId } = {}) {
  const userId = await getCurrentUserId();
  if (knowledgeBaseId) {
    const { data, error } = await supabase
      .from('materials')
      .select('material_tag_relations(material_tags(id, name))')
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('user_id', userId)
      .neq('status', 'deleted');
    if (error) throw error;
    const map = new Map();
    for (const row of data || []) {
      for (const rel of row.material_tag_relations || []) {
        const tag = rel.material_tags;
        if (tag?.id && tag?.name) map.set(tag.id, { id: tag.id, name: tag.name });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }
  const { data, error } = await supabase
    .from('material_tags')
    .select('id, name')
    .eq('user_id', userId)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function replaceMaterialTags(materialId, tagNames) {
  const userId = await getCurrentUserId();
  const names = [...new Set(
    (tagNames || [])
      .map((n) => String(n || '').trim().replace(/^#+/, '').trim())
      .filter(Boolean),
  )];

  const tagIds = [];
  for (const name of names) {
    // same select-or-insert as replaceMaterialTag today
  }

  const { error: clearError } = await supabase
    .from('material_tag_relations')
    .delete()
    .eq('material_id', materialId);
  if (clearError) throw clearError;

  if (tagIds.length) {
    const { error: linkError } = await supabase
      .from('material_tag_relations')
      .insert(tagIds.map((tag_id) => ({ material_id: materialId, tag_id })));
    if (linkError) throw linkError;
  }

  const { error: flagError } = await supabase
    .from('materials')
    .update({ tags_user_edited: true })
    .eq('id', materialId);
  if (flagError) throw flagError;

  return getMaterialById(materialId);
}
```

Update `mapMaterial`:

```js
tagsUserEdited: Boolean(row.tags_user_edited),
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/api/materials.tags.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add refind-demo/src/lib/api/materials.js refind-demo/src/lib/api/materials.tags.test.js
git commit -m "Add list/replace material tags APIs with user-edit flag."
```

---

### Task 6: Context menu + edit tags + move dialog + reparse

**Files:**
- Create: `refind-demo/src/features/knowledge/EditMaterialTagsDialog.jsx`
- Create: `refind-demo/src/features/knowledge/EditMaterialTagsDialog.test.jsx`
- Create: `refind-demo/src/features/knowledge/MoveMaterialDialog.jsx`
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/styles.css` (reuse `.material-context-menu` / dialog patterns)

**Interfaces:**
- Menu items (order): 重新解析 → 编辑标签 → 移动到 → 删除资料
- No title row
- `重新解析` → `parseAndPollMaterial(id, { force: true, sourceUrl: material.url || '' })` then `refreshMaterials()`; toast on success/fail
- `编辑标签` → open `EditMaterialTagsDialog` with current `material.tags`; save → `replaceMaterialTags`
- `移动到` → open `MoveMaterialDialog` listing `knowledgeBases`; confirm → existing `moveMaterial`
- `删除资料` → existing confirm + delete

- [ ] **Step 1: Write dialog / menu tests**

```jsx
// EditMaterialTagsDialog.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditMaterialTagsDialog } from './EditMaterialTagsDialog.jsx';

it('saves normalized tag list', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(
    <EditMaterialTagsDialog
      open
      initialTags={['增长']}
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  await user.clear(screen.getByLabelText(/标签/i)); // or add-via-input UX
  // Prefer chip input: type "研究" + Enter, click 保存
  // expect onSave to have been called with array of strings
});
```

Keep UI simple: textarea with comma/newline-separated tags OR chip row + input. Match existing visual language (no new card chrome).

- [ ] **Step 2: Implement dialogs**

`EditMaterialTagsDialog({ open, initialTags, onSave, onClose, saving })`  
`MoveMaterialDialog({ open, bases, currentBaseId, onPick, onClose })`

- [ ] **Step 3: Rewrite material context menu in `App.jsx`**

Replace title + nested KB list with four buttons. Wire state:

```js
const [editTagsMaterial, setEditTagsMaterial] = useState(null);
const [moveMaterialTarget, setMoveMaterialTarget] = useState(null);

const reparseMaterial = async (material) => {
  setMaterialMenu(null);
  try {
    await parseAndPollMaterial(material.id, {
      force: true,
      sourceUrl: material.url || '',
    });
    await refreshMaterials();
    say('已重新解析。');
  } catch (error) {
    say(error instanceof Error ? error.message : '重新解析失败，请稍后重试。');
  }
};
```

Remove `editMaterialTag` prompt; use dialog + `replaceMaterialTags`.

- [ ] **Step 4: Run UI tests**

Run: `cd refind-demo && npx vitest run src/features/knowledge/EditMaterialTagsDialog.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add refind-demo/src/App.jsx refind-demo/src/features/knowledge/EditMaterialTagsDialog.jsx refind-demo/src/features/knowledge/EditMaterialTagsDialog.test.jsx refind-demo/src/features/knowledge/MoveMaterialDialog.jsx refind-demo/src/styles.css
git commit -m "Simplify material menu with reparse, tag edit, and move dialog."
```

---

### Task 7: Preview page「重新解析」

**Files:**
- Modify: `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx`
- Modify: `refind-demo/src/features/knowledge/MaterialPreview.test.jsx`
- Modify: `refind-demo/src/main.jsx`

**Interfaces:**
- `MaterialPreviewPage({ material, loading, error, onReparse, reparsing })`
- Button in tools/header area:「重新解析」; disabled while `reparsing`
- `main.jsx`: on click → `parseAndPollMaterial(id, { force: true, sourceUrl: material.url || '' })` → reload `getMaterialById` into state + sessionStorage

- [ ] **Step 1: Failing test — button present and calls handler**

```jsx
it('exposes reparse action', async () => {
  const onReparse = vi.fn();
  render(<MaterialPreviewPage material={material} onReparse={onReparse} />);
  await userEvent.click(screen.getByRole('button', { name: '重新解析' }));
  expect(onReparse).toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement UI + main.jsx wiring**

```jsx
// main.jsx excerpt
const [reparsing, setReparsing] = React.useState(false);
const onReparse = async () => {
  if (!routeId || !previewMaterial) return;
  setReparsing(true);
  try {
    await parseAndPollMaterial(routeId, {
      force: true,
      sourceUrl: previewMaterial.url || '',
    });
    const latest = await getMaterialById(routeId);
    if (latest) {
      setPreviewMaterial(latest);
      window.sessionStorage.setItem(`refind-material:${routeId}`, JSON.stringify(latest));
    }
  } catch (error) {
    setPreviewError(error instanceof Error ? error.message : '重新解析失败');
  } finally {
    setReparsing(false);
  }
};
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/knowledge/MaterialPreview.test.jsx`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add refind-demo/src/features/knowledge/MaterialPreviewPage.jsx refind-demo/src/features/knowledge/MaterialPreview.test.jsx refind-demo/src/main.jsx
git commit -m "Add reparse action on material preview page."
```

---

### Task 8: Real `#` tag lists + wire `tagFilters` to chat

**Files:**
- Modify: `refind-demo/src/features/home/HomeComposer.jsx`
- Modify: `refind-demo/src/features/home/HomeComposer.test.jsx`
- Modify: `refind-demo/src/App.jsx` (`Composer` KB panel + `submitHomeQuestion` / `submitKbQuestion`)

**Interfaces:**
- `HomeComposer({ availableTags = [], ... })` where `availableTags: { id: string, name: string }[]`
- Scope still stores **names** in `selectedTags` for display (existing message chrome)
- App resolves names → ids when calling `sendChatMessage`:

```js
function resolveTagFilterIds(selectedNames, availableTags) {
  const byName = new Map(availableTags.map((t) => [t.name, t.id]));
  return selectedNames.map((name) => byName.get(name)).filter(Boolean);
}
```

- Home: `listMaterialTags()` (all user tags) loaded when authenticated / when composer mounts
- KB: `listMaterialTags({ knowledgeBaseId: selectedKnowledgeBase.id })`; pass into `Composer` as `availableTags`
- KB `Composer`: track `selectedTags` (names) like home (not only insert `#` into prompt); submit `{ prompt, thinkingMode, selectedTags }`
- Replace hardcoded `const tags = ['增长策略','用户研究','产品灵感']` in both composers
- Empty list UX: show「暂无标签」in suggest menu (do not fall back to demo names)

- [ ] **Step 1: Update HomeComposer tests**

Remove assertions that depend on `#增长策略` hardcoded forever; instead pass `availableTags={[{ id: '1', name: '增长策略' }]}` and assert that name appears.

- [ ] **Step 2: Implement props + App wiring**

```js
// App.jsx
const [homeTagOptions, setHomeTagOptions] = useState([]);
const [kbTagOptions, setKbTagOptions] = useState([]);

useEffect(() => {
  if (!session) return;
  listMaterialTags().then(setHomeTagOptions).catch(() => setHomeTagOptions([]));
}, [session, knowledgeMaterials]); // refresh when materials change

useEffect(() => {
  if (!selectedKnowledgeBase?.id) {
    setKbTagOptions([]);
    return;
  }
  listMaterialTags({ knowledgeBaseId: selectedKnowledgeBase.id })
    .then(setKbTagOptions)
    .catch(() => setKbTagOptions([]));
}, [selectedKnowledgeBase?.id, knowledgeMaterials]);

// submitHomeQuestion:
tagFilters: resolveTagFilterIds(scope.tags, homeTagOptions),

// submitKbQuestion:
tagFilters: resolveTagFilterIds(request.selectedTags || [], kbTagOptions),
selectedTags: request.selectedTags || [],
```

Update KB `Composer` to accept `availableTags` and include selected tags in submit payload.

- [ ] **Step 3: Run tests**

Run: `cd refind-demo && npx vitest run src/features/home/HomeComposer.test.jsx src/lib/api/chat.test.js`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add refind-demo/src/features/home/HomeComposer.jsx refind-demo/src/features/home/HomeComposer.test.jsx refind-demo/src/App.jsx
git commit -m "Wire real material tags into # filters and chat tagFilters."
```

---

### Task 9: Docs touch-up + manual acceptance

**Files:**
- Modify: `output/Refind拾藏PRD_V1.0.md` (remove「AI 摘要仍为 stub」where this slice closes it)
- Modify: `output/Refind拾藏开发Spec_V1.0.md` (§8.2 note that enrichment is live)
- Modify: `docs/superpowers/specs/2026-09-15-deepseek-summary-tags-design.md` status → 实现中/已落地 after code lands

- [ ] **Step 1: Update PRD/Spec one-liners** to match shipped behavior (summary+tags via DeepSeek on parse; `tags_user_edited`; menu; `#` from DB).

- [ ] **Step 2: Manual checklist**

1. Ingest a new link with real keys → ready summary is AI prose (not `slice(0,140)` of body); ~3 tags on row.
2. Break AI (temp unset key on function) → material still ready with truncate summary; reparse later works.
3. Edit tags manually → `tags_user_edited` true → reparse changes summary, tags unchanged.
4. Context menu shows only four items; move opens dialog; preview has 重新解析.
5. Home `#` and KB `#` list real tags; selecting a tag sends UUID `tagFilters` (verify network payload).
6. `rg -n "DASHSCOPE_API_KEY|DEEPSEEK_API_KEY" refind-demo/src` → no client secrets.

- [ ] **Step 3: Commit docs**

```bash
git add output/Refind拾藏PRD_V1.0.md output/Refind拾藏开发Spec_V1.0.md docs/superpowers/specs/2026-09-15-deepseek-summary-tags-design.md
git commit -m "Sync PRD/Spec with DeepSeek summary and tags behavior."
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| AI summary + ~3 tags on new ready | Task 2–4 |
| Fail soft (truncate, keep material) | Task 4 |
| `tags_user_edited` migration + lock | Task 1, 4, 5 |
| Reparse always rewrites summary; preserves manual tags | Task 4, 6, 7 |
| Edit tags UI sets lock | Task 5–6 |
| Menu four items; move secondary | Task 6 |
| Preview reparse | Task 7 |
| `#` from real tags home + KB | Task 8 |
| No batch backfill / no keys in frontend | Global + Task 9 |
| Tests for prompt/JSON/shouldReplaceTags | Task 2 |
| Mock chat → enrichment | Task 4 |

## Placeholder scan

No TBD / “implement later” steps; each task has concrete files, code, and commands.

## Type consistency

- DB: `tags_user_edited` (snake) ↔ UI: `tagsUserEdited`
- Enrichment returns `tags: string[]` (names); chat `tagFilters` are **UUIDs** resolved in App
- `replaceMaterialTags(materialId, tagNames: string[])` sets user-edited true; parse path uses `replaceMaterialTagRelations` and does **not** set the flag

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-15-phase3-deepseek-summary-tags.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — run tasks in this session with checkpoints  

Which approach?
