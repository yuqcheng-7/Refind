# Refind HTML Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, interactive desktop Refind knowledge-base demo that faithfully reproduces the approved deep-coffee reference.

**Architecture:** Use the Product Design Vite prototype starter with a single React screen. Keep mock data and interaction logic in `Prototype.tsx`, and keep all layout tokens and responsive styles in `prototype.css`; no backend, authentication, integrations, or persistent data.

**Tech Stack:** React, TypeScript, Vite, CSS, React icon library bundled by the starter.

## Global Constraints

- Visual truth is `/Users/zoecheng/.codex/generated_images/019ff51d-efe2-78b0-8875-b174eec26729/exec-9588f1f2-ccd1-4ef2-bc8c-57172aedfcb3.png`.
- Use deep coffee `#3F302F` for sidebar, primary button, and user chat bubble.
- Use web-font loaded Noto Serif SC only for the Refind brand; use Noto Sans SC for KB title, UI, and body.
- Implement local mock interactions only; do not add API calls, upload, login, capture, RAG, or external storage.
- Keep all visible assets as real image files or an existing icon library; do not draw custom icons with CSS/inline SVG.

---

### Task 1: Bootstrap and verify the Product Design prototype

**Files:**
- Create: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/`
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/Prototype.tsx`
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/prototype.css`

**Interfaces:**
- Produces: a working Vite React prototype with `npm run dev`, `npm run check:runtime`, and `npm run build`.

- [ ] **Step 1: Create the desktop prototype starter**

Run:

```bash
node /Users/zoecheng/.codex/plugins/cache/openai-curated-remote/product-design/0.1.52/scripts/bootstrap-prototype.mjs --dest /Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo
```

- [ ] **Step 2: Install starter dependencies**

Run:

```bash
npm install --prefer-offline --no-audit --no-fund
```

- [ ] **Step 3: Verify the protected runtime before edits**

Run:

```bash
npm run check:runtime
```

Expected: exit code 0.

### Task 2: Build the visual app shell and material list

**Files:**
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/Prototype.tsx`
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/prototype.css`

**Interfaces:**
- Consumes: starter React root.
- Produces: `knowledgeBases`, `materials`, and the three-column Refind screen.

- [ ] **Step 1: Add typed presentation data and source tokens**

```ts
type Source = "小红书" | "B站" | "微信" | "知乎" | "公众号";
type Material = { id: number; title: string; summary: string; tags: string[]; source: Source; createdAt: string; cover: string };
```

- [ ] **Step 2: Implement the static shell with exact desktop regions**

```tsx
<main className="refind-shell">
  <aside className="sidebar">...</aside>
  <section className="material-panel">...</section>
  <aside className="chat-panel">...</aside>
</main>
```

- [ ] **Step 3: Add fonts, palette, material-card density, and responsive CSS**

```css
:root { --coffee: #3f302f; --canvas: #fbfaf8; }
.refind-shell { display: grid; grid-template-columns: 294px minmax(540px, 1fr) 390px; min-height: 100vh; }
```

- [ ] **Step 4: Build and check type safety**

Run:

```bash
npm run build
```

Expected: exit code 0.

### Task 3: Add interactive knowledge-base and material controls

**Files:**
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/Prototype.tsx`
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/prototype.css`

**Interfaces:**
- Consumes: material mock data and source tokens from Task 2.
- Produces: selected knowledge base, local search, sorting, source filters, create-KB dialog, add-material parsing state, and material detail dialog.

- [ ] **Step 1: Add state and deterministic filtering functions**

```ts
const [selectedBaseId, setSelectedBaseId] = useState("growth");
const [query, setQuery] = useState("");
const visibleMaterials = materials.filter((material) => material.title.includes(query) || material.tags.join(" ").includes(query));
```

- [ ] **Step 2: Wire all visible knowledge-base and material controls**

```tsx
<button onClick={() => setShowCreateBase(true)}>新建知识库</button>
<input value={query} onChange={(event) => setQuery(event.target.value)} />
```

- [ ] **Step 3: Add dialogs and explicit interaction states**

```tsx
{isParsing && <div role="status">正在解析链接内容…</div>}
{showDetail && <dialog open>...</dialog>}
```

- [ ] **Step 4: Build to verify UI behavior compiles**

Run:

```bash
npm run build
```

Expected: exit code 0.

### Task 4: Add interactive AI conversation and account menu

**Files:**
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/Prototype.tsx`
- Modify: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/src/prototype.css`

**Interfaces:**
- Consumes: current KB and visible mock materials.
- Produces: conversations state, generated mock citations, history menu, and account popover.

- [ ] **Step 1: Add typed conversation state and a deterministic reply factory**

```ts
type Message = { role: "user" | "assistant"; text: string; citations?: number[] };
const createReply = (question: string): Message => ({ role: "assistant", text: `基于当前知识库，${question}`, citations: [1, 2] });
```

- [ ] **Step 2: Wire new conversation, send message, history selection/deletion, and inline citation hover**

```tsx
<form onSubmit={handleSend}>...</form>
<button aria-label="会话历史" onClick={() => setShowHistory((open) => !open)}>...</button>
<sup className="citation">[1]<span className="citation-preview">...</span></sup>
```

- [ ] **Step 3: Wire the bottom user trigger without a default popover**

```tsx
<button className="account-trigger" onClick={() => setShowAccountMenu((open) => !open)}>...</button>
{showAccountMenu && <div className="account-menu">...</div>}
```

- [ ] **Step 4: Build and runtime check**

Run:

```bash
npm run check:runtime && npm run build
```

Expected: both commands exit 0.

### Task 5: Browser verification and design QA

**Files:**
- Create: `/Users/zoecheng/Documents/ChatGPT/拾藏Refind/refind-demo/design-qa.md`

**Interfaces:**
- Consumes: running local prototype and approved visual reference.
- Produces: verified screenshot evidence and a passing QA report.

- [ ] **Step 1: Run the local preview at the source viewport**

Run:

```bash
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

- [ ] **Step 2: Inspect desktop render and primary interactions**

Test knowledge-base switching, search, source filter, add-material parsing state, new conversation, send message, history, source citation hover, and account menu.

- [ ] **Step 3: Capture implementation screenshot at 1440×1024 and compare it with source visual**

Expected: no layout overflow; deep-coffee sidebar and actions, compact cards, and transparent answer layout visibly match.

- [ ] **Step 4: Write final QA report**

`design-qa.md` ends with:

```md
final result: passed
```
