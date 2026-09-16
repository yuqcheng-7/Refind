# Inline Images Preview + OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform link materials show inline body images in preview and OCR those images into `content_text` for RAG, without blocking sync parse.

**Architecture:** Parser extracts ordered `media_urls` from HTML; sync path writes text-only `ready`; background job persists images to Storage, injects `![](storage:…)` into `content_text`, appends OCR appendix, rechunks + embeds.

**Tech Stack:** platform-parser (Python), parse-material Edge (Deno/JS), React preview (`MaterialPreviewPage`), Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-09-16-inline-images-preview-ocr-design.md`

## Global Constraints

- Max **10** inline images per material
- Sync path: **no** download / OCR
- OCR appendix header: `【文内图片识别】`
- Preview markers: `![](storage:{objectKey})`
- Soft-fail per image

---

## File map

| File | Role |
|------|------|
| `tools/platform-parser/server.py` | `html_extract_media_urls`, enrich zhihu/wechat/generic results |
| `supabase/functions/parse-material/extractLinkContent.js` | Same extraction for Edge fallback path |
| `supabase/functions/parse-material/persistRemoteInlineImages.js` | Download + upload inline images |
| `supabase/functions/parse-material/inlineImageContent.js` | Build markdown + OCR appendix from persisted keys |
| `supabase/functions/parse-material/index.ts` | Deferred job for any platform with `media_urls` |
| `refind-demo/src/features/knowledge/materialPreview.js` | Parse body into text/image blocks |
| `refind-demo/src/features/knowledge/MaterialPreviewPage.jsx` | Render image blocks with signed URLs |

---

### Task 1: Extract media URLs from HTML (parser + Edge)

**Files:**
- Create/modify: `tools/platform-parser/server.py`
- Create/modify: `tools/platform-parser/test_inline_images.py` (or extend existing)
- Modify: `supabase/functions/parse-material/extractLinkContent.js` + tests

- [x] **Step 1:** Write failing tests for extracting ordered unique img URLs from HTML (`src`, `data-src`, `data-original`), skip data-URIs / empty.
- [x] **Step 2:** Implement `extract_media_urls_from_html(html, base_url, limit=10)` in Python; wire into `parse_zhihu`, `parse_wechat`, and HTML fallbacks so result includes `media_urls`.
- [x] **Step 3:** Mirror helper in `extractLinkContent.js`; attach `media_urls` on extract result.
- [x] **Step 4:** Run unit tests; pass.

### Task 2: Persist inline images + build enriched content_text

**Files:**
- Create: `persistRemoteInlineImages.js` + test
- Create: `inlineImageContent.js` + test（append markdown images + OCR appendix）
- Modify: `extractRemoteMediaImages.js` if needed to accept storage-backed bytes

- [x] **Step 1:** Failing tests: upload keys `{user}/{id}.inline.{n}.ext`; build `![](storage:key)` list; OCR appendix format.
- [x] **Step 2:** Implement persist (reuse cover fetch headers / referer patterns).
- [x] **Step 3:** Implement `enrichContentWithInlineImages({ baseText, persisted, ocrBlocks })`.
- [x] **Step 4:** Tests pass.

### Task 3: Wire deferred job in parse-material for all platforms

**Files:**
- Modify: `supabase/functions/parse-material/index.ts`

- [x] **Step 1:** Collect `media_urls` from prefetch / extract for any platform (not only xhs).
- [x] **Step 2:** Replace xhs-only deferred OCR with: persist → inject markdown → OCR appendix → update + rechunk + embed.
- [x] **Step 3:** Skip if appendix already present; soft-fail whole background job on throw (log only).

### Task 4: Preview renders storage markdown images

**Files:**
- Modify: `materialPreview.js` + test
- Modify: `MaterialPreviewPage.jsx` (+ CSS if needed)

- [x] **Step 1:** Failing test: `buildReadableBlocks` / new `buildPreviewBlocks` yields `{type:'image', storageKey}` for `![](storage:…)`.
- [x] **Step 2:** Implement block parser; preview component signs URL and shows `<img>`.
- [x] **Step 3:** Manual/style smoke: image max-width 100%, rounded.

### Task 5: Verification

- [x] **Step 1:** Run parser + Edge unit tests + frontend tests for touched files.
- [x] **Step 2:** Update spec status to「已确认 / 实现中」.

---

## Done when

验收标准见 design §8。
