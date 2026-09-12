# Refind Home Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Refind desktop demo home screen from the approved visual mock and keep the primary save-and-ask paths interactive.

**Architecture:** Replace the existing three-column workspace shell with a single airy home canvas and a persistent narrow sidebar. Keep all behaviour in the existing React entry component; use local state for the composer, knowledge-base selector, tag selector, link parsing feedback, and sidebar navigation.

**Tech Stack:** React 19, Vite 6, lucide-react, CSS.

## Global Constraints

- Source visual: `/Users/zoecheng/.codex/generated_images/019ffc9c-8cc9-7863-9233-21f3dd567ced/exec-45401883-3227-498d-b7e0-5c99f8f491cd.png`.
- Desktop-first 1440 × 1024 composition; keep the sidebar narrow and the home canvas unframed.
- No voice input. Composer placeholder is exactly `请输入内容进行提问`.
- Use lucide-react for UI controls; use the generated star asset for the decorative mark.
- Preserve the project Sites runtime files and retain working `npm run build` / `npm run test:sites`.

---

### Task 1: Prepare the home-screen asset and page state

**Files:**
- Create: `refind-demo/public/assets/refind-star.png`
- Modify: `refind-demo/src/App.jsx`

**Interfaces:**
- Consumes: `refind-star.png` as the non-standard hero visual.
- Produces: Home navigation state, composer state, and visible link-save feedback.

- [ ] **Step 1: Write the failing test**

```js
test('shows the approved composer copy and no voice control', () => {
  render(<App />);
  expect(screen.getByPlaceholderText('请输入内容进行提问')).toBeVisible();
  expect(screen.queryByLabelText('语音输入')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- home-demo.test.jsx`

Expected: FAIL because the approved home composer has not replaced the old workspace.

- [ ] **Step 3: Write minimal implementation**

```jsx
const [prompt, setPrompt] = useState('');
const [notice, setNotice] = useState('');

function submitPrompt(event) {
  event.preventDefault();
  if (!prompt.trim()) return;
  setNotice('已开始基于全部知识库整理回答。');
  setPrompt('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- home-demo.test.jsx`

Expected: PASS.

### Task 2: Implement visual layout and compact menus

**Files:**
- Modify: `refind-demo/src/styles.css`
- Modify: `refind-demo/src/App.jsx`

**Interfaces:**
- Consumes: the component state from Task 1.
- Produces: sidebar, main hero, bottom composer, and selectable menu surfaces.

- [ ] **Step 1: Write the failing test**

```js
test('opens a knowledge-base selector from the composer', async () => {
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: '全部知识库' }));
  expect(screen.getByRole('menu', { name: '选择知识库' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- home-demo.test.jsx`

Expected: FAIL because the selector is not yet rendered.

- [ ] **Step 3: Write minimal implementation**

```jsx
<button type="button" onClick={() => setShowBases((open) => !open)}>全部知识库</button>
{showBases && <div role="menu" aria-label="选择知识库">...</div>}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- home-demo.test.jsx`

Expected: PASS.

### Task 3: Verify visual and runtime handoff

**Files:**
- Modify: `refind-demo/design-qa.md`

- [ ] **Step 1: Run production build**

Run: `npm run build`

Expected: exit code 0 and emitted `dist/client/index.html`.

- [ ] **Step 2: Run Sites worker test**

Run: `npm run test:sites`

Expected: all tests pass.

- [ ] **Step 3: Capture and compare desktop implementation**

Use the in-app browser at 1440 × 1024, exercise sidebar selection, knowledge-base chooser, tag chooser, link action, and prompt send. Record visual comparison against the approved source image in `design-qa.md`.

- [ ] **Step 4: Fix all P0–P2 differences and record result**

Expected: `design-qa.md` ends with `final result: passed`.
