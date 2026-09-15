# RAG Chat Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real Bailian embeddings + DeepSeek chat so home/KB questions use strict RAG with real citations (or general chat with none).

**Architecture:** Edge Functions call DashScope `text-embedding-v4` (1024-d) and DeepSeek (`deepseek-chat` / `deepseek-reasoner`). After parse sets a material `ready`, `embed-material` fills `material_chunks.embedding`. `chat-message` resolves mode, retrieves via `match_material_chunks`, prompts DeepSeek, persists `chat_messages` + `message_citations`, and the React app stops using fake demo citations.

**Tech Stack:** Supabase Edge (Deno), pgvector, DeepSeek API, DashScope/Bailian embedding, React 19 + Vite, Vitest.

**Design spec:** `docs/superpowers/specs/2026-09-15-rag-chat-foundation-design.md`  
**Parent roadmap plan:** `docs/superpowers/plans/2026-09-13-phase3-ai-rag-launch.md` (Tasks 1–2 only)

## Global Constraints

- Homepage: no KB/tag → `answer_mode=general`; any KB or tag → force offline + strict RAG.
- Knowledge-base surface: always strict RAG on current base.
- Strict RAG must not invent citations; general mode must not show KB citation UI.
- Model chip: `fast` → `deepseek-chat`; `deep` → `deepseek-reasoner`; same `DEEPSEEK_API_KEY`.
- Embedding: Bailian `text-embedding-v4`, **dimensions=1024**, secret `DASHSCOPE_API_KEY`.
- Secrets only in Edge Function env; never in Vite bundle or git.
- Do not commit unless the user explicitly asks.
- Out of scope this plan: note generate, note↔KB sync, real summary/tags, hosted deploy, real web search.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `supabase/functions/_shared/ai.ts` | `embedTexts`, `deepseekChat`, model mapping |
| `supabase/functions/_shared/rag.ts` | `resolveAnswerMode`, retrieve helpers, prompt + citation parse |
| `supabase/functions/embed-material/index.ts` | Embed all null chunks for one material |
| `supabase/functions/chat-message/index.ts` | One chat turn (general or RAG) |
| `supabase/migrations/202609150002_rag_match_chunks.sql` | `vector(1024)` + `match_material_chunks` RPC + index |
| `supabase/functions/parse-material/index.ts` | After ready, fire-and-forget invoke embed-material |
| `refind-demo/src/lib/api/chat.js` | Client wrapper for `chat-message` |
| `refind-demo/src/lib/api/chat.test.js` | Unit tests for request shaping / response mapping |
| `refind-demo/src/App.jsx` | Wire home + KB submit to real API |
| `refind-demo/.env.example` | Document that AI keys are Edge secrets only (no Vite keys) |

---

### Task 1: Shared AI client + mode helpers (TDD)

**Files:**
- Create: `supabase/functions/_shared/ai.ts`
- Create: `supabase/functions/_shared/rag.ts`
- Create: `supabase/functions/_shared/rag.test.ts` (run with Deno test if available; else mirror pure logic under `refind-demo/src/lib/api/ragMode.js` + Vitest — prefer **pure JS mirror** `refind-demo/src/lib/api/ragMode.js` for Vitest if Deno test harness is missing)
- Create: `refind-demo/src/lib/api/ragMode.js`
- Create: `refind-demo/src/lib/api/ragMode.test.js`

**Interfaces:**
- Produces:
  - `mapThinkingMode(mode: 'fast' | 'deep'): 'deepseek-chat' | 'deepseek-reasoner'`
  - `resolveAnswerMode({ surface, knowledgeBaseIds?, tagFilters? }): 'general' | 'rag'`
  - `embedTexts(texts: string[]): Promise<number[][]>`
  - `deepseekChat(messages, { model, temperature? }): Promise<string>`
  - `parseCitationMarkers(answer: string): number[]` — unique 1-based indices in appearance order from `[n]` markers

- [ ] **Step 1: Write failing Vitest for mode + model mapping**

```js
// refind-demo/src/lib/api/ragMode.test.js
import { describe, expect, it } from 'vitest';
import { mapThinkingMode, resolveAnswerMode, parseCitationMarkers } from './ragMode.js';

describe('resolveAnswerMode', () => {
  it('forces rag on knowledge surface', () => {
    expect(resolveAnswerMode({ surface: 'knowledge', knowledgeBaseIds: [], tagFilters: [] })).toBe('rag');
  });
  it('uses general on home with empty scope', () => {
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: [], tagFilters: [] })).toBe('general');
  });
  it('uses rag when any kb or tag present on home', () => {
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: ['kb1'], tagFilters: [] })).toBe('rag');
    expect(resolveAnswerMode({ surface: 'home', knowledgeBaseIds: [], tagFilters: ['t1'] })).toBe('rag');
  });
});

describe('mapThinkingMode', () => {
  it('maps fast/deep to DeepSeek model ids', () => {
    expect(mapThinkingMode('fast')).toBe('deepseek-chat');
    expect(mapThinkingMode('deep')).toBe('deepseek-reasoner');
  });
});

describe('parseCitationMarkers', () => {
  it('extracts unique citation orders', () => {
    expect(parseCitationMarkers('见[2]与[1]，再看[2]。')).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `cd refind-demo && npx vitest run src/lib/api/ragMode.test.js`  
Expected: FAIL cannot find module

- [ ] **Step 3: Implement `ragMode.js`**

```js
// refind-demo/src/lib/api/ragMode.js
export function resolveAnswerMode({ surface, knowledgeBaseIds = [], tagFilters = [] }) {
  if (surface === 'knowledge') return 'rag';
  if (knowledgeBaseIds.length > 0 || tagFilters.length > 0) return 'rag';
  return 'general';
}

export function mapThinkingMode(mode) {
  return mode === 'deep' ? 'deepseek-reasoner' : 'deepseek-chat';
}

export function parseCitationMarkers(answer) {
  const seen = new Set();
  const orders = [];
  const re = /\[(\d+)\]/g;
  let match;
  while ((match = re.exec(answer))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    orders.push(n);
  }
  return orders;
}
```

- [ ] **Step 4: Implement Edge `_shared/ai.ts` + `_shared/rag.ts`**

```ts
// supabase/functions/_shared/ai.ts
const EMBED_DIM = 1024;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get('DASHSCOPE_API_KEY');
  if (!key) throw new Error('DASHSCOPE_API_KEY missing');
  const batches: number[][] = [];
  for (let i = 0; i < texts.length; i += 10) {
    const slice = texts.slice(i, i + 10);
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-v4',
        input: slice,
        dimensions: EMBED_DIM,
        encoding_format: 'float',
      }),
    });
    if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const rows = (json.data || []).sort((a: { index: number }, b: { index: number }) => a.index - b.index);
    for (const row of rows) batches.push(row.embedding as number[]);
  }
  return batches;
}

export async function deepseekChat(
  messages: { role: string; content: string }[],
  opts: { model: 'deepseek-chat' | 'deepseek-reasoner'; temperature?: number },
): Promise<string> {
  const key = Deno.env.get('DEEPSEEK_API_KEY');
  if (!key) throw new Error('DEEPSEEK_API_KEY missing');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: opts.temperature ?? 0.3,
    }),
  });
  if (!res.ok) throw new Error(`deepseek failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.choices[0].message.content as string;
}
```

```ts
// supabase/functions/_shared/rag.ts
export function resolveAnswerMode(input: {
  surface: 'home' | 'knowledge';
  knowledgeBaseIds?: string[];
  tagFilters?: string[];
}): 'general' | 'rag' {
  if (input.surface === 'knowledge') return 'rag';
  if ((input.knowledgeBaseIds?.length ?? 0) > 0 || (input.tagFilters?.length ?? 0) > 0) return 'rag';
  return 'general';
}

export function mapThinkingMode(mode: 'fast' | 'deep' | string | undefined) {
  return mode === 'deep' || mode === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat';
}

export function parseCitationMarkers(answer: string): number[] {
  const seen = new Set<number>();
  const orders: number[] = [];
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer))) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    orders.push(n);
  }
  return orders;
}

export function buildRagSystemPrompt(snippets: { index: number; content: string; title: string }[]) {
  const block = snippets
    .map((s) => `[${s.index}] 《${s.title}》\n${s.content}`)
    .join('\n\n');
  return `你是拾藏知识库助手。只能依据下列资料片段回答。引用时使用 [n] 标注。若资料不足以回答，明确说明资料不足，不要编造。\n\n${block}`;
}
```

- [ ] **Step 5: Re-run Vitest — expect PASS**

Run: `cd refind-demo && npx vitest run src/lib/api/ragMode.test.js`  
Expected: PASS

---

### Task 2: Migration — vector(1024) + `match_material_chunks`

**Files:**
- Create: `supabase/migrations/202609150002_rag_match_chunks.sql`

**Interfaces:**
- Produces RPC `match_material_chunks(query_embedding vector(1024), match_count int, filter_user uuid, filter_kb_ids uuid[] default null, filter_tag_ids uuid[] default null)`
- Returns: `chunk_id, material_id, knowledge_base_id, content, similarity, material_title, knowledge_base_name`
- Tag filter: AND semantics — material must have **all** listed tag ids via `material_tag_relations`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/202609150002_rag_match_chunks.sql
-- Lock embedding dimension to Bailian text-embedding-v4 default (1024).
-- Safe if all existing embeddings are null (Phase 2 left them empty).

alter table public.material_chunks
  alter column embedding type vector(1024)
  using case
    when embedding is null then null
    else embedding::vector(1024)
  end;

create index if not exists material_chunks_embedding_ivfflat
  on public.material_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_material_chunks(
  query_embedding vector(1024),
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
  similarity float,
  material_title text,
  knowledge_base_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as chunk_id,
    c.material_id,
    c.knowledge_base_id,
    c.content,
    (1 - (c.embedding <=> query_embedding))::float as similarity,
    m.title as material_title,
    kb.name as knowledge_base_name
  from public.material_chunks c
  join public.materials m on m.id = c.material_id
  join public.knowledge_bases kb on kb.id = c.knowledge_base_id
  where m.user_id = filter_user
    and m.status = 'ready'
    and c.embedding is not null
    and (filter_kb_ids is null or cardinality(filter_kb_ids) = 0 or c.knowledge_base_id = any(filter_kb_ids))
    and (
      filter_tag_ids is null
      or cardinality(filter_tag_ids) = 0
      or (
        select count(distinct r.tag_id)
        from public.material_tag_relations r
        where r.material_id = c.material_id
          and r.tag_id = any(filter_tag_ids)
      ) = cardinality(filter_tag_ids)
    )
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

revoke all on function public.match_material_chunks(vector, int, uuid, uuid[], uuid[]) from public;
grant execute on function public.match_material_chunks(vector, int, uuid, uuid[], uuid[]) to authenticated, service_role;
```

Note: If `materials.title` column name differs, align to actual schema before applying (`title` vs `display_title` — check `init.sql`).

- [ ] **Step 2: Confirm materials title column**

Run: `rg -n "create table public.materials" -A 40 supabase/migrations/202609130001_init.sql`  
Adjust migration if needed.

- [ ] **Step 3: Apply migration locally (or cloud)**

Run: `cd /Users/zoecheng/Documents/ChatGPT/拾藏Refind && npx supabase db push`  
(or `supabase migration up` against linked project)  
Expected: migration applied without error

---

### Task 3: `embed-material` + hook from `parse-material`

**Files:**
- Create: `supabase/functions/embed-material/index.ts`
- Modify: `supabase/functions/parse-material/index.ts` (after successful ready + chunk insert)

**Interfaces:**
- Consumes: `{ materialId: string }` (auth: user JWT or service role)
- Produces: `{ ok: true, embedded: number }` or error JSON
- Only embeds when material `status='ready'` and chunk `embedding` is null

- [ ] **Step 1: Implement embed-material**

```ts
// supabase/functions/embed-material/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { embedTexts } from '../_shared/ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, service);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const isService = authHeader.includes(service);
    if (!isService && (userError || !userData?.user)) {
      return response({ error: 'unauthorized' }, 401);
    }

    const body = await req.json();
    const materialId = body.materialId as string;
    if (!materialId) return response({ error: 'materialId required' }, 400);

    const { data: material, error: materialError } = await admin
      .from('materials')
      .select('id, user_id, status')
      .eq('id', materialId)
      .maybeSingle();
    if (materialError || !material) return response({ error: 'material not found' }, 404);
    if (!isService && material.user_id !== userData!.user.id) {
      return response({ error: 'forbidden' }, 403);
    }
    if (material.status !== 'ready') {
      return response({ error: 'material not ready' }, 409);
    }

    const { data: chunks, error: chunksError } = await admin
      .from('material_chunks')
      .select('id, content, embedding')
      .eq('material_id', materialId)
      .is('embedding', null)
      .order('chunk_index');
    if (chunksError) throw chunksError;
    if (!chunks?.length) return response({ ok: true, embedded: 0 });

    const vectors = await embedTexts(chunks.map((c) => c.content));
    for (let i = 0; i < chunks.length; i++) {
      const { error } = await admin
        .from('material_chunks')
        .update({ embedding: vectors[i] as unknown as string })
        .eq('id', chunks[i].id);
      if (error) throw error;
    }
    return response({ ok: true, embedded: chunks.length });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
```

Note: pgvector via PostgREST may need embedding passed as `[...]` string; if update fails, use `admin.rpc` or `.update({ embedding: JSON.stringify(vectors[i]) })` per local Supabase behavior — verify in Step 3.

- [ ] **Step 2: After parse ready, invoke embed (non-blocking)**

In `parse-material/index.ts`, after successful chunk insert + `status: 'ready'`, before return:

```ts
const embedUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/embed-material`;
EdgeRuntime.waitUntil?.(
  fetch(embedUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ materialId: material.id }),
  }).catch(() => {}),
);
// If EdgeRuntime.waitUntil unavailable, void fetch(...) without awaiting.
```

Prefer `void fetch(...)` if `EdgeRuntime` typing is awkward — do not block the parse response on embedding.

- [ ] **Step 3: Configure secrets + deploy functions**

User already has keys locally. Do **not** paste into chat. Run (with keys from user env / secure prompt):

```bash
npx supabase secrets set DEEPSEEK_API_KEY=... DASHSCOPE_API_KEY=...
npx supabase functions deploy embed-material
npx supabase functions deploy parse-material
```

For local: put secrets in `supabase/.env` or `supabase secrets set --env-file` per CLI docs — never commit the file.

- [ ] **Step 4: Manual verify**

1. Ingest one short text/link material to ready.  
2. Query: `select id, embedding is not null from material_chunks where material_id = '...'`  
Expected: `true` for chunks (may need manual `curl` to embed-material if parse hook missed).

---

### Task 4: `chat-message` Edge Function

**Files:**
- Create: `supabase/functions/chat-message/index.ts`

**Interfaces:**
- Request JSON:
  ```ts
  {
    conversationId?: string;
    content: string;
    thinkingMode?: 'fast' | 'deep';
    onlineEnabled?: boolean;
    knowledgeBaseIds?: string[];
    tagFilters?: string[]; // tag UUIDs
    surface: 'home' | 'knowledge';
  }
  ```
- Response JSON:
  ```ts
  {
    conversationId: string;
    userMessageId: string;
    assistantMessageId: string;
    answerMode: 'general' | 'rag';
    content: string;
    insufficient: boolean;
    citations: {
      order: number;
      materialId: string;
      knowledgeBaseId: string;
      title: string;
      knowledgeBaseName: string;
      excerpt: string;
    }[];
  }
  ```

- [ ] **Step 1: Implement handler skeleton** — auth via user JWT; create conversation if missing; insert user message; branch on `resolveAnswerMode`.

- [ ] **Step 2: General path**

```ts
const model = mapThinkingMode(body.thinkingMode);
const answer = await deepseekChat(
  [
    { role: 'system', content: '你是拾藏助手。用简洁中文回答。不要伪造知识库引用。' },
    { role: 'user', content: body.content },
  ],
  { model },
);
// insert assistant chat_messages with answer_mode=general, is_insufficient=false
// return citations: []
```

Ignore `onlineEnabled` for real search in this slice (no fabricated web sources). Optional: append note in system prompt that当前未联网.

- [ ] **Step 3: RAG path**

1. Resolve KB ids: if `surface==='knowledge'` and empty ids, require at least one id from client (current base).  
2. `const [queryVec] = await embedTexts([body.content])`  
3. `admin.rpc('match_material_chunks', { query_embedding: queryVec, match_count: 8, filter_user: user.id, filter_kb_ids: kbIds || null, filter_tag_ids: tagIds || null })`  
4. If no rows or all similarity below soft floor (e.g. `< 0.2`): write insufficient assistant message (Chinese: 当前范围内资料不足…), `is_insufficient=true`, empty citations.  
5. Else `buildRagSystemPrompt` + DeepSeek; `parseCitationMarkers`; insert `message_citations` for valid orders only (snapshot title/kb name/excerpt from matched rows).  
6. Persist `retrieval_summary` jsonb: `{ knowledgeBaseCount, materialCount, chunkCount }`.

- [ ] **Step 4: Deploy**

```bash
npx supabase functions deploy chat-message
```

- [ ] **Step 5: Smoke with curl** (auth token from logged-in session)

Expected: general returns no citations; rag with embedded material returns real titles.

---

### Task 5: Frontend client + replace demo replies

**Files:**
- Create: `refind-demo/src/lib/api/chat.js`
- Create: `refind-demo/src/lib/api/chat.test.js`
- Modify: `refind-demo/src/App.jsx` (`submitHomeQuestion`, `submitKbQuestion`)
- Modify: `refind-demo/src/features/home/HomeComposer.test.jsx` (drop expectation of fixed fake citation labels if still asserted)
- Modify: `refind-demo/.env.example` — comment that AI keys are Supabase Edge secrets

**Interfaces:**
- `sendChatMessage(payload)` → mapped response used by App message list
- Message shape for UI: keep `{ id, question, answer?, mode, online, selectedBases, selectedTags, citations: [{ order, label, materialId, excerpt }] }`

- [ ] **Step 1: Failing test for chat mapper**

```js
// refind-demo/src/lib/api/chat.test.js
import { describe, expect, it } from 'vitest';
import { mapChatResponseToMessage } from './chat.js';

it('maps rag citations to UI labels', () => {
  const msg = mapChatResponseToMessage({
    question: 'Q',
    selectedBases: ['产品'],
    selectedTags: [],
    online: false,
    response: {
      assistantMessageId: 'm1',
      answerMode: 'rag',
      content: '答案[1]',
      insufficient: false,
      citations: [{ order: 1, title: '增长笔记', materialId: 'mat1', excerpt: '...' }],
    },
  });
  expect(msg.mode).toBe('rag');
  expect(msg.citations[0].label).toBe('增长笔记');
  expect(msg.answer).toBe('答案[1]');
});
```

- [ ] **Step 2: Implement `chat.js`** using existing supabase client pattern from `auth.js` / `materials.js` (`functions.invoke('chat-message', { body })`).

- [ ] **Step 3: Wire App**

Replace fake citations in `submitHomeQuestion` / `submitKbQuestion` with async invoke:

```js
const submitHomeQuestion = async (request) => {
  // optimistic user bubble optional; then:
  const thinkingMode = /* from composer scope */ request.thinkingMode || 'fast';
  const response = await sendChatMessage({
    content: request.prompt,
    thinkingMode,
    onlineEnabled: request.online,
    knowledgeBaseIds: /* resolve names → ids from knowledgeBases state */,
    tagFilters: /* resolve tag names → ids if available; else [] */,
    surface: 'home',
  });
  // append mapped message including answer + citations
};
```

KB submit: `surface: 'knowledge'`, `knowledgeBaseIds: [selectedKnowledgeBase.id]`.

Show loading / error via existing `say(...)`.

- [ ] **Step 4: Update HomeComposer tests** that assert hardcoded `小红书增长策略` — either mock `sendChatMessage` or assert structure without fixed demo labels.

- [ ] **Step 5: Run frontend tests**

Run: `cd refind-demo && npx vitest run src/lib/api/ragMode.test.js src/lib/api/chat.test.js src/features/home/HomeComposer.test.jsx`  
Expected: PASS

---

### Task 6: End-to-end checklist (manual)

- [ ] **Step 1:** Secrets present on target Supabase project (`DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`).
- [ ] **Step 2:** Ingest material → chunks embedded.
- [ ] **Step 3:** Home, no scope → general answer, no citation chrome.
- [ ] **Step 4:** Home, select that KB → RAG answer with real title; toggle DS深度 still works (slower).
- [ ] **Step 5:** Irrelevant question in empty/unrelated KB → insufficient copy, no fake refs.
- [ ] **Step 6:** Confirm no API keys in `refind-demo/dist` or git diff.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Embed on ready via Bailian v4 / 1024-d | Task 2–3 |
| Strict RAG vs general mode rules | Task 1, 4 |
| DS快速 / DS深度 mapping | Task 1, 4–5 |
| Real citations / insufficient | Task 4–5 |
| Secrets only on Edge | Task 3, 6 + `.env.example` |
| Non-goals excluded | Global Constraints |

## Placeholder / consistency check

- Migration filename `202609150002_*` avoids clash with `202609150001_platform_connections_select.sql` and `202609140001_material_playback_fields.sql`.
- Embedding API uses OpenAI-compatible DashScope endpoint with explicit `dimensions: 1024`.
- Client and Edge share the same mode/model semantics via mirrored helpers.

## Follow-up landed（会话历史分面 · 2026-09-15）

独立设计与验收见 `docs/superpowers/specs/2026-09-15-chat-history-surfaces-design.md`：

- `chat_conversations.surface` + `knowledge_base_id`
- 首页 / 各知识库历史隔离；新增会话立即落库草稿
- 内联重命名；空草稿可在首条消息前改绑分面
