# Material Preview Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Unify the knowledge-base material preview page shell and per-type reading rules so link / file / video previews feel like one product.

**Architecture:** Keep typed body viewers; restructure `MaterialPreviewPage` chrome (title → icon actions → single-line facts → quote summary → body). Fix link prose in `materialPreview.js` (natural paragraphs + strict outline headings + foldable image-OCR appendix). Constrain Word/PDF/media widths in CSS.

**Tech Stack:** React, Vitest, Lucide icons, existing mammoth/markdown/PDF viewers, `styles.css`.

**Spec:** `docs/superpowers/specs/2026-09-16-material-preview-layout-design.md`

## Global Constraints

- Shell order: kicker → title → icon actions → facts one-line → quote summary → body
- Actions always visible: 重新解析 (`RefreshCw`) + 回到原文/打开原文件 (`ExternalLink`)
- Facts: 来源 · 类型 · 时间 · 标签 on one row; labels kept; compact
- Links: L1 magazine; H1 numbered outlines only; P1 blank-line paragraphs only (no ~120-char hard wrap)
- Image OCR appendix in preview: default collapsed; still in `content_text` for RAG
- Files: typed viewers + same shell; Word images `max-width:100%` and `max-height:min(70vh,720px)`
- Video: player → caption; subtitles default collapsed
- Out of scope: video ASR / frame understanding

---

## File map

| File | Role |
|------|------|
| `refind-demo/src/features/knowledge/materialPreview.js` | P1 split, H1 headings, split body vs OCR appendix, readable blocks |
| `refind-demo/src/features/knowledge/materialPreview.test.js` | Unit tests for above |
| `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx` | Shell layout, actions+icons, facts row, fold OCR, video subtitle fold |
| `refind-demo/src/features/knowledge/MaterialPreview.test.jsx` | Component smoke for shell / folds |
| `refind-demo/src/features/knowledge/MaterialFilePreview.jsx` | Reuse shared paragraph helper if needed; docx container class |
| `refind-demo/src/styles.css` | `.material-preview-*` tokens, facts one-line, docx img limits, width unify |

---

### Task 1: Link prose — P1 paragraphs + H1 headings

**Files:**
- Modify: `refind-demo/src/features/knowledge/materialPreview.js`
- Test: `refind-demo/src/features/knowledge/materialPreview.test.js`

**Interfaces:**
- Produces: `isPreviewHeading(line) → boolean` (stricter); `splitReadableParagraphs(text) → string[]` (blank-line only); `buildReadableBlocks(text)` unchanged return shape

- [x] **Step 1: Write failing tests**

Append to `materialPreview.test.js`:

```js
it('only treats numbered outline lines as headings', () => {
  expect(isPreviewHeading('一、免费工具怎么选')).toBe(true);
  expect(isPreviewHeading('1. 安装步骤')).toBe(true);
  expect(isPreviewHeading('打开很快')).toBe(false);
  expect(isPreviewHeading('2 项目技术栈')).toBe(false); // no delimiter → not H1
});

it('splits only on blank lines and keeps long sentences intact', () => {
  const wall = '在推荐工具前，先说清楚什么叫「够用」的修图体验：打开快、导出不加水印。优先看是否支持中文界面。';
  expect(splitReadableParagraphs(wall)).toEqual([wall]);
  expect(splitReadableParagraphs(`${wall}\n\n第二段内容。`)).toEqual([wall, '第二段内容。']);
});
```

Update or remove the existing soft-wrap test that expects `part.length <= 220` chopping.

- [x] **Step 2: Run tests — expect FAIL**

Run: `cd refind-demo && npm run test:ui -- src/features/knowledge/materialPreview.test.js`  
Expected: FAIL on new heading/paragraph assertions.

- [x] **Step 3: Implement**

In `materialPreview.js`:

1. Narrow `isPreviewHeading` to only:
   - `/^[一二三四五六七八九十百千]+[、.．]/`
   - `/^\d{1,2}[\.、．]\s*\S/`
   - Remove the `1 中文标题` (space, no delimiter) and overly loose patterns.
2. Change `splitReadableParagraphs` to:
   - Normalize newlines
   - Split on `/\n{2,}/` only
   - Optionally still run `insertSectionBreaks` **only** before numbered outlines (so `。一、` becomes a new paragraph) — do **not** call `softWrapLongParagraph` / clause splitting / 120-char slicing
3. Delete or stop using `PREFERRED_PARAGRAPH_CHARS` soft-wrap path for preview.

- [x] **Step 4: Run tests — expect PASS**

Run: same command as Step 2. Expected: PASS.

- [x] **Step 5: Commit** (only if user asked for commits in this session)

```bash
git add refind-demo/src/features/knowledge/materialPreview.js refind-demo/src/features/knowledge/materialPreview.test.js
git commit -m "$(cat <<'EOF'
fix(preview): respect natural paragraphs and strict outline headings

EOF
)"
```

---

### Task 2: Split foldable image-recognition appendix from body

**Files:**
- Modify: `refind-demo/src/features/knowledge/materialPreview.js`
- Test: `refind-demo/src/features/knowledge/materialPreview.test.js`

**Interfaces:**
- Produces: `splitPreviewBodyAndImageAppendix(text) → { body: string, appendix: string }`
  - `appendix` is the trailing block starting at `【文内图片识别】` (inclusive), or `''`
  - `body` is everything before that header, trimmed

- [x] **Step 1: Write failing test**

```js
import { splitPreviewBodyAndImageAppendix } from './materialPreview.js';

it('splits image recognition appendix for folded preview', () => {
  const raw = '正文段落。\n\n【文内图片识别】\n\n【图1】\n识别字';
  expect(splitPreviewBodyAndImageAppendix(raw)).toEqual({
    body: '正文段落。',
    appendix: '【文内图片识别】\n\n【图1】\n识别字',
  });
  expect(splitPreviewBodyAndImageAppendix('仅正文')).toEqual({ body: '仅正文', appendix: '' });
});
```

- [x] **Step 2: Run test — expect FAIL**

- [x] **Step 3: Implement**

```js
const IMAGE_APPENDIX_HEADER = '【文内图片识别】';

export function splitPreviewBodyAndImageAppendix(text = '') {
  const value = String(text || '');
  const at = value.indexOf(IMAGE_APPENDIX_HEADER);
  if (at < 0) return { body: value.trim(), appendix: '' };
  return {
    body: value.slice(0, at).trim(),
    appendix: value.slice(at).trim(),
  };
}
```

`buildReadableBlocks` should operate on `body` only when the page passes body; appendix rendered separately.

- [x] **Step 4: Run tests — PASS**

- [x] **Step 5: Commit** (if requested)

---

### Task 3: Preview shell — actions, facts row, quote summary

**Files:**
- Modify: `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx`
- Modify: `refind-demo/src/styles.css` (`.material-preview-*`)
- Test: `refind-demo/src/features/knowledge/MaterialPreview.test.jsx`

**Interfaces:**
- Consumes: existing material fields (`url`, `tags`, `summary`, …)
- UI: tools under title; facts `dl` single row; summary keeps quote block +「摘要」label; body section titled「原文」

- [x] **Step 1: Write / extend failing component test**

In `MaterialPreview.test.jsx`, for a link material fixture assert:

```js
expect(screen.getByRole('button', { name: /重新解析/ })).toBeInTheDocument();
expect(screen.getByRole('link', { name: /回到原文/ })).toBeInTheDocument();
// tools should not be the only content in a top-right header cluster — optional DOM check:
expect(document.querySelector('.material-preview-actions')).toBeTruthy();
expect(document.querySelector('.material-preview-facts')).toBeTruthy();
```

Add `RefreshCw` import usage expectation via accessible name is enough.

- [x] **Step 2: Run test — expect FAIL** (missing `.material-preview-actions` or structure)

- [x] **Step 3: Implement shell**

Restructure header roughly as:

```jsx
<div className="material-preview-kicker">…</div>
<h1>{title}</h1>
<div className="material-preview-actions">
  {onReparse ? (
    <button type="button" className="material-preview-action" onClick={onReparse} disabled={reparsing}>
      <RefreshCw size={14} /> {reparsing ? '解析中…' : '重新解析'}
    </button>
  ) : null}
  {isFile ? <OpenOriginalFileButton … /> : null}
  {isLink ? (
    <a className="material-preview-action" href={material.url} target="_blank" rel="noreferrer">
      <ExternalLink size={14} /> 回到原文
    </a>
  ) : null}
</div>
<dl className="material-preview-facts is-inline">…来源 类型 时间 标签…</dl>
```

Update `OpenOriginalFileButton` to use the same `material-preview-action` class + `ExternalLink` icon before label.

Summary section: keep quote styling; ensure visible title text「摘要」(can keep `id="preview-summary-title"`).

CSS:

```css
.material-preview-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 12px}
.material-preview-action{/* shallow border button, inline-flex, gap 6px, height ~32px */}
.material-preview-facts.is-inline{
  display:flex;flex-wrap:nowrap;align-items:flex-start;gap:18px;
  overflow:hidden;
}
.material-preview-facts.is-inline>div{flex:0 0 auto}
.material-preview-facts.is-inline .material-preview-facts-tags{flex:1 1 auto;min-width:0}
.material-preview-facts.is-inline .material-preview-tags{
  flex-wrap:nowrap;overflow:hidden;
}
.material-preview-facts.is-inline .material-preview-tags li{
  white-space:nowrap;
}
```

Remove/relocate old `.material-preview-tools` top-right cluster so it no longer fights the title.

Tighten vertical spacing vs current facts (slightly denser labels/values per spec).

- [x] **Step 4: Run `MaterialPreview.test.jsx` — PASS**

- [x] **Step 5: Commit** (if requested)

---

### Task 4: Fold image appendix (links) + fold video subtitles

**Files:**
- Modify: `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx`
- Test: `refind-demo/src/features/knowledge/MaterialPreview.test.jsx`

- [x] **Step 1: Failing tests**

```js
it('folds image recognition appendix by default', () => {
  render(<MaterialPreviewPage material={{
    kind: 'link',
    title: '测',
    body: '可见正文\n\n【文内图片识别】\n\n【图1】\n秘密字',
    status: 'ready',
  }} />);
  expect(screen.getByText('可见正文')).toBeInTheDocument();
  expect(screen.queryByText('秘密字')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /图片识别/ }));
  expect(screen.getByText('秘密字')).toBeInTheDocument();
});

it('folds video subtitles by default', () => {
  render(<MaterialPreviewPage material={{
    kind: 'link',
    platform: 'bilibili',
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    title: '视频',
    caption: '简介文案',
    subtitles: '隐藏字幕行',
    status: 'ready',
  }} />);
  expect(screen.getByText('简介文案')).toBeInTheDocument();
  expect(screen.queryByText('隐藏字幕行')).not.toBeInTheDocument();
});
```

(Adjust fixture fields to match demo material shape used in existing tests.)

- [x] **Step 2: Run — FAIL**

- [x] **Step 3: Implement**

Link article body:

```jsx
const { body, appendix } = splitPreviewBodyAndImageAppendix(articleBody);
// render ParagraphBlock with body
// if appendix: <details> or button-toggled section titled「图片识别」
```

Video branch: show player + caption section; wrap subtitles in the same collapsed pattern (default closed). Label「字幕」.

- [x] **Step 4: Run — PASS**

- [x] **Step 5: Commit** (if requested)

---

### Task 5: File viewers — width unify + Word image clamp

**Files:**
- Modify: `refind-demo/src/styles.css`
- Modify: `refind-demo/src/features/knowledge/MaterialFilePreview.jsx` (only if wrapper class missing)
- Test: optional CSS assertion not required; add a short note in `MaterialFilePreview.test.jsx` if easy, else manual check listed in Step 4

- [x] **Step 1: Add CSS rules**

```css
.material-preview-body,
.material-preview-docx,
.material-preview-markdown,
.material-preview-plaintext,
.material-preview-structured,
.material-preview-paragraphs{
  max-width:740px;
}
.material-preview-pdf,
.material-preview-image{
  max-width:740px; /* was 920 — unify reading column */
}
.material-preview-docx img,
.material-preview-markdown img{
  display:block;
  max-width:100%;
  width:auto;
  height:auto;
  max-height:min(70vh,720px);
  object-fit:contain;
  border-radius:12px;
}
```

- [x] **Step 2: Ensure docx HTML renders inside `.material-preview-docx`** (already true — verify mammoth output not stripped of imgs)

- [x] **Step 3: Run file preview tests**

Run: `cd refind-demo && npm run test:ui -- src/features/knowledge/MaterialFilePreview.test.jsx src/features/knowledge/MaterialPreview.test.jsx`

Expected: PASS

- [x] **Step 4: Manual smoke**

Open a Word material with a wide illustration — image must stay inside column and not dominate more than ~one viewport height.

- [x] **Step 5: Commit** (if requested)

---

### Task 6: Verification + spec status

- [x] **Step 1: Run full touched suite**

```bash
cd refind-demo && npm run test:ui -- \
  src/features/knowledge/materialPreview.test.js \
  src/features/knowledge/MaterialPreview.test.jsx \
  src/features/knowledge/MaterialFilePreview.test.jsx
```

Expected: all PASS

- [x] **Step 2: Spec already `已确认` — leave as-is; if any behavior drifted during impl, patch the spec in the same PR/commit as the fix

- [x] **Step 3: Mark plan checkboxes done in this file as tasks complete**

---

## Done when

Matches spec §9 验收：统一骨架、链接不碎切、OCR/字幕默认折叠、Word 图不溢出、视频播放器→文案。

## Spec coverage check

| Spec section | Task |
|--------------|------|
| §3 Shared shell | Task 3 |
| §4 Link L1/H1/P1 | Task 1 |
| §4 OCR fold | Task 2 + 4 |
| §5 Files + Word clamp | Task 5 |
| §6 Video fold subs | Task 4 |
| §7 Tokens | Task 3 + 5 CSS |
| §10 Video ASR | Explicitly out of plan |
