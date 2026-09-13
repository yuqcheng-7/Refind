# Phase 3: AI / RAG / Notes Intelligence / Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 2 backend into a V1.0 product: real embeddings + strict RAG, citation UX, inspiration-card capture from answers, AI note generation with card citations, note↔knowledge-base sync, and production deploy.

**Architecture:** Edge Functions orchestrate DeepSeek Chat + 阿里云百炼 `text-embedding-v4`. Material ready events enqueue chunk embedding into `material_chunks.embedding` (pgvector). Chat endpoints retrieve top-k chunks under KB/tag filters, persist `chat_messages` + `message_citations`. Note generate creates `note_revisions` then writes `content.sections` with `cardId` / citation indexes (prototype Task 6 contract). Sync creates `origin_type=note` materials linked via `note_knowledge_base_materials`. Deploy: Supabase prod + static frontend (Cloudflare Pages or existing Sites packaging).

**Tech Stack:** Supabase Edge Functions (Deno), DeepSeek Chat API, DashScope/Bailian embedding API, pgvector, React 19 + Vite, CI deploy.

**Depends on:** Phase 2 complete (`docs/superpowers/plans/2026-09-13-phase2-backend-foundation.md`)  
**Canonical design:** `docs/superpowers/specs/2026-09-13-phase2-3-roadmap-design.md`

## Global Constraints

- Homepage: no KB/tag → `answer_mode=general` (DeepSeek; online switch honored). Any KB or tag → force offline + strict RAG.
- Knowledge-base AI: always strict RAG on current base only.
- Strict RAG must not invent citations; general mode must not show KB citation UI.
- Note generate: create `before_generate` revision; replace body in place; RAG cards → interactive `[n]` bound to `cardId`; general cards → no fake material citations.
- Note sync: editing note updates all linked materials; editing a synced material updates note then fans out; deleting KB/material only unlinks; deleting note deletes all synced materials.
- Secrets only in Edge Function env (`DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, service role); never in Vite bundle.
- Do not commit unless the user asks.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | DeepSeek + embedding client helpers |
| `supabase/functions/_shared/rag.ts` | retrieveChunks, buildPrompt, parseCitations |
| `supabase/functions/embed-material/index.ts` | Embed chunks for one material |
| `supabase/functions/chat-message/index.ts` | Home / KB chat turn |
| `supabase/functions/generate-note/index.ts` | Note AI generation + revision |
| `supabase/functions/sync-note/index.ts` | Note ↔ KB material sync |
| `supabase/functions/generate-mindmap/index.ts` | Optional mindmap (if in V1.0 scope) |
| `supabase/migrations/202609140001_rag_indexes.sql` | IVFFlat / HNSW index on embeddings |
| `refind-demo/src/lib/api/chat.js` | Client wrappers for chat |
| `refind-demo/src/lib/api/notes.js` | Extend with `generateNote`, `syncNoteToBases` |
| `refind-demo/src/features/home/*` | Persist messages; wire citations |
| Deploy: `.github/workflows/deploy.yml` or Sites scripts | Build + promote |

---

### Task 1: Embedding pipeline + pgvector index

**Files:**
- Create: `supabase/functions/_shared/ai.ts`
- Create: `supabase/functions/embed-material/index.ts`
- Create: `supabase/migrations/202609140001_rag_indexes.sql`
- Modify: `parse-material` to invoke embed after `ready` (or DB webhook)

**Interfaces:**
- Consumes: `material_chunks` rows with `body` / `content` text, `embedding` null
- Produces: `embedText(text: string): Promise<number[]>` via Bailian `text-embedding-v4`; updates chunk embeddings; `match_material_chunks(query_embedding, filter)` RPC

- [ ] **Step 1: Shared AI helper**

```ts
// supabase/functions/_shared/ai.ts
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DASHSCOPE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-v4',
      input: { texts },
    }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status}`);
  const json = await res.json();
  return json.output.embeddings.map((e: { embedding: number[] }) => e.embedding);
}

export async function deepseekChat(messages: { role: string; content: string }[], opts?: { temperature?: number }) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: opts?.temperature ?? 0.3 }),
  });
  if (!res.ok) throw new Error(`deepseek failed: ${res.status}`);
  const json = await res.json();
  return json.choices[0].message.content as string;
}
```

- [ ] **Step 2: `embed-material` function** — load chunks for material; batch embed; update rows; skip if status ≠ `ready`.

- [ ] **Step 3: RPC for retrieval**

```sql
create or replace function public.match_material_chunks(
  query_embedding vector(1024), -- confirm Bailian dimension; adjust if needed
  match_count int,
  filter_user uuid,
  filter_kb_ids uuid[] default null,
  filter_tag_ids uuid[] default null
)
returns table (
  chunk_id uuid,
  material_id uuid,
  knowledge_base_id uuid,
  content text,
  similarity float
)
language sql stable as $$
  select c.id, c.material_id, m.knowledge_base_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from material_chunks c
  join materials m on m.id = c.material_id
  where m.user_id = filter_user
    and m.status = 'ready'
    and c.embedding is not null
    and (filter_kb_ids is null or m.knowledge_base_id = any(filter_kb_ids))
    -- tag AND filter via material_tag_relations when filter_tag_ids provided
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

Confirm embedding dimension against Bailian docs; set column type accordingly in migration if Phase 2 used a placeholder.

- [ ] **Step 4: After parse success, invoke embed-material** (HTTP from parse function or queue).

- [ ] **Step 5: Manual** — ingest one material; chunks have non-null embeddings; `match_material_chunks` returns it for a related query.

---

### Task 2: Chat message Edge Function + home/KB wiring

**Files:**
- Create: `supabase/functions/_shared/rag.ts`
- Create: `supabase/functions/chat-message/index.ts`
- Create: `refind-demo/src/lib/api/chat.js`
- Modify: `HomeComposer.jsx`, `HomeConversation.jsx`, `KbConversation.jsx`, `App.jsx`

**Interfaces:**
- Request: `{ conversationId?, content, model?, onlineEnabled?, knowledgeBaseIds?: string[], tagFilters?: string[], surface: 'home' | 'knowledge', currentKnowledgeBaseId? }`
- Response: `{ conversationId, messageId, answerMode: 'general' | 'rag', content, citations: Citation[], insufficient?: boolean }`
- Citation: `{ order, materialId, knowledgeBaseId, title, platform, snippet }`

- [ ] **Step 1: Mode resolution**

```ts
export function resolveAnswerMode(input: {
  surface: 'home' | 'knowledge';
  knowledgeBaseIds?: string[];
  tagFilters?: string[];
}): 'general' | 'rag' {
  if (input.surface === 'knowledge') return 'rag';
  if ((input.knowledgeBaseIds?.length ?? 0) > 0 || (input.tagFilters?.length ?? 0) > 0) return 'rag';
  return 'general';
}
```

- [ ] **Step 2: RAG path** — embed question → `match_material_chunks` → prompt with numbered snippets → DeepSeek → parse `[n]` → insert `chat_messages` + `message_citations`. If no usable chunks → `insufficient` response per Spec (no fabricated full answer).

- [ ] **Step 3: General path** — DeepSeek with user online preference; **zero** citations; persist `answer_mode=general`.

- [ ] **Step 4: Client** — replace demo reply generators; keep chat shell / share / history UX.

- [ ] **Step 5: Tests** — unit test `resolveAnswerMode`; integration smoke with local functions if available.

---

### Task 3: Citation UI + inspiration card capture persistence

**Files:**
- Modify: answer rendering / citation hover components (home + KB)
- Modify: `AnswerActions.jsx` + card save path to call `createInspirationCard`
- Modify: `refind-demo/src/lib/api/notes.js` (cards already exist from Phase 2)

**Interfaces:**
- Consumes: `citations[]` from chat response
- Produces: hover/click citation card with title, KB, platform, snippet, open material preview; save card with `answer_mode`, `citation_snapshot`, `content_snapshot`, `source_question_snapshot`

- [ ] **Step 1: Render inline `[n]`** matching Spec §5.8; deleted materials show「该资料已删除」.

- [ ] **Step 2: Save card** — fragment or whole answer; write real `inspiration_cards` row (no local-only demo).

- [ ] **Step 3: Manual** — RAG answer → hover citation → open preview; bookmark → appears in 灵感卡片 after refresh.

---

### Task 4: AI note generation (`generate-note`)

**Files:**
- Create: `supabase/functions/generate-note/index.ts`
- Modify: `refind-demo/src/features/notes/NoteEditor.jsx`
- Modify: `refind-demo/src/lib/api/notes.js`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

**Interfaces:**
- `POST generate-note` body: `{ noteId }`
- Server: load note + ordered `note_inspiration_cards` + card snapshots + thoughts → insert `note_revisions` (`reason=before_generate`) → DeepSeek structured JSON → update `notes.content` as:

```ts
type NoteSection = {
  type: 'paragraph';
  text: string;
  cardId?: string;
  citationIndex?: number;
  citationLabel?: string;
};
type NoteContent = {
  text: string;
  blocks: Array<{ text: string; cardId?: string; citationLabel?: string; citationIndex?: number }>;
  sections: NoteSection[];
};
```

- General cards: sections without material-style fake citations (label may be `通用回答` for preview, but no material_id).
- RAG cards: bind `cardId` + citation label from `citation_snapshot`.

- [ ] **Step 1: Edge Function** implements Spec generate order: save → revision → generate → atomic replace.

- [ ] **Step 2: Client** — re-enable「生成笔记」; call API; show 生成中; on success reload note content; keep materials panel state.

- [ ] **Step 3: Preserve prototype citation UX** — hover menu + `CardDetailDialog` + viewport clamp (`NoteEditor` CitationButton).

- [ ] **Step 4: Tests** — mock fetch for generate; ensure disabled when no materials.

- [ ] **Step 5: Fix Phase-1 P3 if cheap** — avoid double period when snapshot already ends with `。`.

---

### Task 5: Note ↔ knowledge base sync

**Files:**
- Create: `supabase/functions/sync-note/index.ts`
- Modify: `KnowledgeBaseSyncDialog` / NotesWorkspace sync handlers
- Modify: material update path to detect `origin_type=note` and fan-in

**Interfaces:**
- `syncNote({ noteId, knowledgeBaseIds: string[] })` → upsert `note_knowledge_base_materials` + materials `origin_type=note`
- On note update: push title/body to all linked materials; re-embed those materials
- On synced material edit: update note content, then push to other linked materials
- Delete note → delete linked materials; delete material/KB → remove link only

- [ ] **Step 1: Implement sync Edge Function** matching Spec §5.7 sync rules + non-blocking UI notice.

- [ ] **Step 2: Wire right-click「添加至知识库」** to real API.

- [ ] **Step 3: Manual matrix**

| Action | Expected |
| --- | --- |
| Sync note to 2 KBs | 2 materials appear |
| Edit note | both materials update |
| Delete one synced material | note remains; other sync remains |
| Delete note | both materials gone |

---

### Task 6: Mindmap (V1.0 if in scope) + citation→material deep link

**Files:**
- Create: `supabase/functions/generate-mindmap/index.ts` (optional if shipping V1.0 mindmap)
- Modify: material preview routing from citation / card

- [ ] **Step 1: Citation / card「查看原文」** opens `#/material/:id` preview (prototype path) with auth.

- [ ] **Step 2: Mindmap** — user-triggered only; persist `mindmaps.tree_data`; reopen with conversation.

If mindmap slips schedule, document as Phase 3.1 residual — **do not block** deploy of RAG + notes generate + sync.

---

### Task 7: Production deploy + end-to-end launch QA

**Files:**
- Create: deploy workflow / env docs
- Modify: `refind-demo/design-qa.md`
- Modify: `output/Refind拾藏PRD_V1.0.md` milestone status (when done)

- [ ] **Step 1: Supabase prod project** — link, push migrations, set secrets (`DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`), deploy functions.

- [ ] **Step 2: Frontend build**

```bash
cd refind-demo
npm run build
# deploy dist/client via Cloudflare Pages or existing Sites packaging
```

- [ ] **Step 3: E2E launch checklist**

| Path | Pass? |
| --- | --- |
| Register → default KB | |
| Upload/parse → embed ready | |
| Home general ask | |
| Home RAG with KB + citations | |
| KB AI RAG | |
| Save inspiration card | |
| Organize → generate note → citation opens card | |
| Sync note to KB | |
| Second browser / user isolation | |

- [ ] **Step 4: Record QA in `design-qa.md`; mark Phase 3 plan tasks complete.**

---

## Plan Self-Review

- Roadmap §4.1 items 1–8 covered by Tasks 1–7 (mindmap optional in Task 6).
- Phase 2 non-goals correctly become Phase 3 goals.
- Note content shape matches prototype (`sections` + `cardId`) for citation hover.
- Secrets stay server-side; Vite only gets anon key + URL.
- V1.5 items (rerank, batch tags, MediaCrawler full platforms) explicitly out of this plan.
