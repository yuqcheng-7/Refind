# Home Online QW Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home「联网」toggle into real Bailian/Qwen web search with clickable source chips, while defaulting to offline DS快速 and auto-switching to QW when online is enabled.

**Architecture:** General (no KB/tags) + `onlineEnabled` calls DashScope **native** Generation API (`enable_search` + `enable_source`) so `search_info.search_results` is available—OpenAI-compatible chat completions **do not** return sources. Offline DS paths stay on existing `deepseekChat`. Frontend adds QW to the model menu, locks DS while online, maps `webSources` into answer UI, and persists them on `chat_messages.web_sources`.

**Tech Stack:** Supabase Edge `chat-message`, DashScope Generation API + existing `DASHSCOPE_API_KEY`, React home composer/conversation, Vitest + node:test.

## Global Constraints

- Default: **不联网** + **DS快速**
- Online on → force **QW**; DS fast/deep disabled; online off → restore prior DS mode
- Online search only when `answer_mode === general` (no KB/tags; knowledge surface never searches)
- RAG unchanged (DeepSeek + material citations only)
- Source chips label: `来源 N：{title}`; open `url` in new tab
- No fabricated sources; empty `webSources` → no chips
- Spec: `docs/superpowers/specs/2026-09-17-home-online-qwen-search-design.md`

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/202609170001_chat_messages_web_sources.sql` | Add `web_sources jsonb` |
| `supabase/functions/_shared/webSearch.js` | Parse `search_info` → `webSources`; DashScope generation+search helper |
| `supabase/functions/_shared/webSearch.test.js` | Unit tests for parse + request shaping |
| `supabase/functions/_shared/ai.ts` | Keep DS chat; optionally thin wrapper re-export if needed |
| `supabase/functions/chat-message/core.js` | Normalize `modelId` (`ds-fast` \| `ds-deep` \| `qwen`) |
| `supabase/functions/chat-message/index.ts` | General branch: online → Qwen search; persist `web_sources`; return `webSources` |
| `refind-demo/src/lib/api/chat.js` | Pass `modelId`; map `webSources` |
| `refind-demo/src/lib/api/conversations.js` | Load `web_sources` into turns |
| `refind-demo/src/features/home/HomeComposer.jsx` | QW option + online↔model lock |
| `refind-demo/src/features/chat/AnswerContent.jsx` | Render web source chips / open URL |
| `refind-demo/src/features/home/HomeConversation.jsx` | Pass `webSources` when not RAG |
| `refind-demo/src/App.jsx` | Wire `modelId` on home submit |
| Spec/PRD/Spec sync (light) | Mark foundation「联网占位」superseded |

---

### Task 1: Migration `web_sources`

**Files:**
- Create: `supabase/migrations/202609170001_chat_messages_web_sources.sql`
- Test: apply locally / verify column via SQL (or migration review)

**Interfaces:**
- Produces: `chat_messages.web_sources jsonb null` — array of `{ order, title, url }`

- [ ] **Step 1: Add migration**

```sql
-- Persist network search sources for home general+online answers (history replay).
alter table public.chat_messages
  add column if not exists web_sources jsonb;

comment on column public.chat_messages.web_sources is
  'Optional web search sources [{order,title,url}] for general+online answers';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/202609170001_chat_messages_web_sources.sql
git commit -m "$(cat <<'EOF'
Add chat_messages.web_sources for online answer citations.

EOF
)"
```

---

### Task 2: Parse search_info + DashScope online chat helper (TDD)

**Files:**
- Create: `supabase/functions/_shared/webSearch.js`
- Create: `supabase/functions/_shared/webSearch.test.js`

**Interfaces:**
- Produces:
  - `parseWebSources(searchInfo): { order: number, title: string, url: string }[]`
  - `qwenChatWithOptionalSearch(messages, { onlineEnabled, model?, temperature? }): Promise<{ content: string, webSources: ... }>`
- Consumes: `DASHSCOPE_API_KEY`; env `BAILIAN_ONLINE_MODEL` default `qwen-plus`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWebSources } from './webSearch.js';

test('parseWebSources maps search_results with url', () => {
  const sources = parseWebSources({
    search_results: [
      { index: 1, title: 'A股行情', url: 'https://example.com/a' },
      { index: 2, title: 'NoUrl', url: '' },
      { title: 'B', url: 'https://example.com/b' },
    ],
  });
  assert.deepEqual(sources, [
    { order: 1, title: 'A股行情', url: 'https://example.com/a' },
    { order: 2, title: 'B', url: 'https://example.com/b' },
  ]);
});

test('parseWebSources returns [] for missing info', () => {
  assert.deepEqual(parseWebSources(null), []);
  assert.deepEqual(parseWebSources({}), []);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test supabase/functions/_shared/webSearch.test.js`  
Expected: FAIL module/function missing

- [ ] **Step 3: Implement `webSearch.js`**

```js
export function parseWebSources(searchInfo) {
  const rows = Array.isArray(searchInfo?.search_results) ? searchInfo.search_results : [];
  const out = [];
  let order = 1;
  for (const row of rows) {
    const url = String(row?.url || '').trim();
    if (!url) continue;
    const title = String(row?.title || url).trim() || url;
    out.push({ order: Number(row?.index) > 0 ? Number(row.index) : order, title, url });
    order += 1;
  }
  // Re-number sequentially if indexes missing/duplicate
  return out.map((item, i) => ({ ...item, order: i + 1 }));
}

/**
 * DashScope native Generation API — required for enable_source / search_info.
 * Compatible-mode chat completions do NOT return search sources.
 */
export async function qwenChatWithOptionalSearch(messages, opts = {}) {
  const key = Deno.env.get('DASHSCOPE_API_KEY');
  if (!key) throw new Error('DASHSCOPE_API_KEY missing');
  const model = opts.model || Deno.env.get('BAILIAN_ONLINE_MODEL') || 'qwen-plus';
  const onlineEnabled = opts.onlineEnabled === true;
  const body = {
    model,
    input: { messages },
    parameters: {
      result_format: 'message',
      temperature: opts.temperature ?? 0.3,
      enable_search: onlineEnabled,
      ...(onlineEnabled
        ? { search_options: { enable_source: true, search_strategy: 'turbo' } }
        : {}),
    },
  };
  const res = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw new Error(`qwen search chat failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const content = json?.output?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('qwen search chat returned empty content');
  }
  const webSources = onlineEnabled ? parseWebSources(json?.output?.search_info) : [];
  return { content, webSources };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test supabase/functions/_shared/webSearch.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/webSearch.js supabase/functions/_shared/webSearch.test.js
git commit -m "$(cat <<'EOF'
Add DashScope web-search helper with source parsing.

EOF
)"
```

---

### Task 3: Normalize `modelId` on chat-message

**Files:**
- Modify: `supabase/functions/chat-message/core.js`
- Modify: `supabase/functions/chat-message/core.test.js`

**Interfaces:**
- Produces: `normalizeRequestBody` → `modelId: 'ds-fast' | 'ds-deep' | 'qwen'`
- Mapping: legacy `thinkingMode: 'deep'` → `ds-deep`; else if `modelId`/`thinkingMode` indicates qwen → `qwen`; else `ds-fast`
- When `onlineEnabled` and general (checked later in index): force qwen path even if client sends ds-*

- [ ] **Step 1: Failing test**

```js
test('normalizes modelId qwen and ds modes', () => {
  assert.equal(
    normalizeRequestBody({ content: 'hi', surface: 'home', modelId: 'qwen' }).modelId,
    'qwen',
  );
  assert.equal(
    normalizeRequestBody({ content: 'hi', surface: 'home', thinkingMode: 'deep' }).modelId,
    'ds-deep',
  );
  assert.equal(
    normalizeRequestBody({ content: 'hi', surface: 'home' }).modelId,
    'ds-fast',
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test supabase/functions/chat-message/core.test.js`  
Expected: FAIL on `modelId`

- [ ] **Step 3: Implement in `normalizeRequestBody`**

```js
function resolveModelId(value) {
  const raw = String(value.modelId || '').trim();
  if (raw === 'qwen' || raw === 'ds-fast' || raw === 'ds-deep') return raw;
  if (value.thinkingMode === 'deep') return 'ds-deep';
  if (value.thinkingMode === 'qwen') return 'qwen';
  return 'ds-fast';
}

// inside body:
modelId: resolveModelId(value),
thinkingMode: resolveModelId(value) === 'ds-deep' ? 'deep' : 'fast',
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-message/core.js supabase/functions/chat-message/core.test.js
git commit -m "$(cat <<'EOF'
Accept modelId for DS and QW home chat routing.

EOF
)"
```

---

### Task 4: Wire general branch online search in `chat-message`

**Files:**
- Modify: `supabase/functions/chat-message/index.ts` (general block ~252–287)
- Modify: shared prompt — remove「未启用联网搜索」note

**Interfaces:**
- Consumes: `qwenChatWithOptionalSearch`, `parseWebSources`, `stripMarkdownForReading`
- Produces response fields: `webSources: []`, persists `web_sources` on assistant row

- [ ] **Step 1: Replace general branch logic**

Pseudocode to implement:

```ts
if (answerMode === 'general') {
  const useQwen = body.onlineEnabled || body.modelId === 'qwen';
  let plainAnswer: string;
  let webSources: { order: number; title: string; url: string }[] = [];

  const systemContent = `你是拾藏助手，像懂行的朋友用自然中文聊天。
要求：
- 直接把话说清楚，像人与人交流，不要用 Markdown（禁止 **加粗**、# 标题、\`代码\`、--- 分隔线等符号残留在正文里）。
- 若要分点，用「1. 2. 3.」且序号与内容写在同一行。
- 不要伪造知识库引用或「根据资料」字样。
${body.onlineEnabled ? '- 已启用联网搜索；可依据检索结果回答，并可用 [n] 对应来源编号。' : ''}`;

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: body.content },
  ];

  if (useQwen) {
    const result = await qwenChatWithOptionalSearch(messages, {
      onlineEnabled: body.onlineEnabled === true,
    });
    plainAnswer = stripMarkdownForReading(result.content);
    webSources = body.onlineEnabled ? result.webSources : [];
  } else {
    const answer = await deepseekChat(messages, { model: mapThinkingMode(body.thinkingMode) });
    plainAnswer = stripMarkdownForReading(answer);
  }

  const { data: assistantMessage, error } = await admin
    .from('chat_messages')
    .insert({
      ...messageBase,
      role: 'assistant',
      content: plainAnswer,
      is_insufficient: false,
      web_sources: webSources.length ? webSources : null,
    })
    .select('id')
    .single();
  // ...
  return response({
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    answerMode,
    content: plainAnswer,
    insufficient: false,
    citations: [],
    webSources,
  });
}
```

- [ ] **Step 2: Deploy function**

Run: `npx supabase functions deploy chat-message --no-verify-jwt`  
Expected: Deployed Functions.

- [ ] **Step 3: Apply migration** (Tokyo project / linked remote)

Run: `npx supabase db push` (or dashboard SQL)  
Expected: column exists

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-message/index.ts
git commit -m "$(cat <<'EOF'
Route home online general chat through Qwen web search.

EOF
)"
```

---

### Task 5: Frontend API mapping + conversation reload

**Files:**
- Modify: `refind-demo/src/lib/api/chat.js`
- Modify: `refind-demo/src/lib/api/chat.test.js` (if present; else extend)
- Modify: `refind-demo/src/lib/api/conversations.js`
- Modify: `refind-demo/src/lib/api/conversations.test.js`

**Interfaces:**
- `sendChatMessage({ ..., modelId, onlineEnabled })`
- Message shape: `webSources: [{ order, title, url }]`
- `pairChatTurns` / load: read `assistant.web_sources`

- [ ] **Step 1: Failing chat map test**

```js
expect(mapChatResponseToMessage({
  question: '天气',
  response: {
    assistantMessageId: 'a1',
    userMessageId: 'u1',
    conversationId: 'c1',
    content: '晴',
    answerMode: 'general',
    webSources: [{ order: 1, title: '气象台', url: 'https://example.com' }],
  },
}).webSources).toEqual([{ order: 1, title: '气象台', url: 'https://example.com' }]);
```

- [ ] **Step 2: Implement `chat.js`**

```js
// send body:
if (modelId) body.modelId = modelId;

// map:
webSources: (response.webSources || [])
  .filter((s) => s?.url)
  .map((s, i) => ({
    order: Number(s.order) || i + 1,
    title: String(s.title || s.url),
    url: String(s.url),
  })),
```

- [ ] **Step 3: `conversations.js` select `web_sources`, pair into turns**

```js
// select: 'id, role, content, answer_mode, is_insufficient, created_at, web_sources'
citations: ...,
webSources: Array.isArray(assistantMessage?.web_sources)
  ? assistantMessage.web_sources
  : [],
```

- [ ] **Step 4: Run**

Run: `cd refind-demo && npm run test:ui -- src/lib/api/chat.test.js src/lib/api/conversations.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add refind-demo/src/lib/api/chat.js refind-demo/src/lib/api/conversations.js refind-demo/src/lib/api/*.test.js
git commit -m "$(cat <<'EOF'
Map and reload webSources for home online answers.

EOF
)"
```

---

### Task 6: HomeComposer — QW + online auto-switch

**Files:**
- Modify: `refind-demo/src/features/home/HomeComposer.jsx`
- Modify: `refind-demo/src/features/home/HomeComposer.test.jsx`
- Modify: `refind-demo/src/App.jsx` (`submitHomeQuestion` pass `modelId`)

**Interfaces:**
- Scope fields: `modelId: 'ds-fast' | 'ds-deep' | 'qwen'`, `lastDeepSeekModelId: 'ds-fast' | 'ds-deep'`, `online`, …
- `defaultHomeScope`: `{ online: false, modelId: 'ds-fast', lastDeepSeekModelId: 'ds-fast', selectedBases: [], selectedTags: [] }`
- Submit payload: `{ modelId, thinkingMode: modelId === 'ds-deep' ? 'deep' : 'fast', online, ... }`

- [ ] **Step 1: Failing tests**

```js
it('defaults to DS fast offline', () => {
  render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS快速');
  expect(screen.getByRole('button', { name: '不联网' })).toHaveAttribute('aria-pressed', 'false');
});

it('switches to QW when online is enabled and restores DS when disabled', async () => {
  render(<HomeComposer bases={bases} onSubmit={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: '选择模型' }));
  await userEvent.click(screen.getByRole('button', { name: '深度' })); // or option DS深度
  await userEvent.click(screen.getByRole('button', { name: '不联网' }));
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('QW');
  expect(screen.getByRole('button', { name: '联网' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: '联网' }));
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('DS深度');
});
```

Adapt selectors to whatever labels the menu uses after UI tweak (`QW` chip / menu row).

- [ ] **Step 2: Implement composer behavior**

- Menu rows: DS快速 / DS深度 / QW
- Toggle online on: save `lastDeepSeekModelId` if current is ds-*; set `modelId: 'qwen'`
- Toggle online off: `modelId = lastDeepSeekModelId`
- While `online`: disable DS menu buttons
- While `hasScope` (KB/tags): force online false (existing)
- Chip label: `modelId === 'qwen' ? 'QW' : modelId === 'ds-deep' ? 'DS深度' : 'DS快速'`

- [ ] **Step 3: App.jsx pass modelId**

```js
await sendChatMessage({
  ...
  modelId: request.modelId || (request.thinkingMode === 'deep' ? 'ds-deep' : 'ds-fast'),
  onlineEnabled: scope.online,
});
```

- [ ] **Step 4: Run HomeComposer tests**

Run: `cd refind-demo && npm run test:ui -- src/features/home/HomeComposer.test.jsx -t "defaults to DS|switches to QW|forces offline|switches from online"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add refind-demo/src/features/home/HomeComposer.jsx refind-demo/src/features/home/HomeComposer.test.jsx refind-demo/src/App.jsx
git commit -m "$(cat <<'EOF'
Add QW model option and lock DS while online.

EOF
)"
```

---

### Task 7: Answer UI — web source chips

**Files:**
- Modify: `refind-demo/src/features/chat/AnswerContent.jsx`
- Modify: `refind-demo/src/features/chat/AnswerContent.test.jsx`
- Modify: `refind-demo/src/features/home/HomeConversation.jsx`
- Modify: `refind-demo/src/features/home/HomeConversation.test.jsx`

**Interfaces:**
- `AnswerContent({ text, citations, webSources, ... })`
- Web chip `aria-label={`来源 ${order}：${title}`}`; click → `window.open(url, '_blank', 'noopener,noreferrer')`
- Prefer: map `webSources` into citation-like meta with `url` and `kind: 'web'`; if answer contains `[n]`, reuse inline chips; also show footer list of sources if no markers (always show footer row under answer when `webSources.length`)

**Recommended UX (match spec):** always render a footer under the answer:

```jsx
{webSources?.length > 0 && (
  <div className="answer-web-sources" aria-label="网络来源">
    {webSources.map((s) => (
      <button
        key={s.order}
        type="button"
        className="answer-web-source"
        aria-label={`来源 ${s.order}：${s.title}`}
        onClick={() => window.open(s.url, '_blank', 'noopener,noreferrer')}
      >
        来源 {s.order}：{s.title}
      </button>
    ))}
  </div>
)}
```

Reuse existing citation chip styles where possible (`.answer-cite` / new sibling class in `styles.css`).

- [ ] **Step 1: Failing UI test**

```js
it('opens web source urls from online answers', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(
    <AnswerContent
      text="根据最新消息…"
      webSources={[{ order: 1, title: '气象台', url: 'https://example.com/weather' }]}
      conversational
      interactive
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '来源 1：气象台' }));
  expect(open).toHaveBeenCalledWith('https://example.com/weather', '_blank', 'noopener,noreferrer');
  open.mockRestore();
});
```

- [ ] **Step 2: Implement footer + HomeConversation pass-through**

```jsx
<AnswerContent
  text={message.answer}
  citations={isRag ? message.citations : []}
  webSources={!isRag ? (message.webSources || []) : []}
  ...
/>
```

- [ ] **Step 3: Run tests**

Run: `cd refind-demo && npm run test:ui -- src/features/chat/AnswerContent.test.jsx src/features/home/HomeConversation.test.jsx`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add refind-demo/src/features/chat/AnswerContent.jsx refind-demo/src/features/chat/AnswerContent.test.jsx refind-demo/src/features/home/HomeConversation.jsx refind-demo/src/styles.css
git commit -m "$(cat <<'EOF'
Show clickable web source chips on online answers.

EOF
)"
```

---

### Task 8: Docs sync + smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-rag-chat-foundation-design.md` — note联网已由 2026-09-17 切片替代
- Modify: `docs/superpowers/specs/2026-09-17-home-online-qwen-search-design.md` — status → 实现中/已落地 when done
- Optional light PRD/Spec lines for 联网真实搜索

- [ ] **Step 1: Update foundation non-goal line** to point at new spec
- [ ] **Step 2: Manual smoke** (logged-in demo): offline DS问一句；开联网确认芯片变 QW；问时事/天气；确认来源可点；关联网回 DS；选 KB 确认无联网搜索
- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/specs/*.md output/*.md
git commit -m "$(cat <<'EOF'
Document home QW online search as shipped.

EOF
)"
```

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| Default offline + DS快速 | 6 |
| Online → QW, DS disabled; offline restores DS | 6 |
| Real web search via Bailian | 2, 4 |
| Source UI clickable | 7 |
| Persist sources for history | 1, 4, 5 |
| RAG / KB never online search | 4 (general-only branch), 6 (UI force offline) |
| No fake「未启用联网」prompt | 4 |
| `BAILIAN_ONLINE_MODEL` / qwen-plus | 2 |

**API note locked in plan:** use DashScope **native** Generation (not compatible-mode) so `search_info` is returned.

**Placeholder scan:** none intentional.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-17-home-online-qwen-search.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — run tasks in this session with executing-plans checkpoints  

Which approach?
