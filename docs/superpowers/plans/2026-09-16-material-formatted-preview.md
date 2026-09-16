# Material Formatted Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Typed formatted preview for uploaded PDF/Markdown/Word + open-original for all files; improve PPTX/XLSX structure.

**Tech:** Supabase signed URLs, mammoth (DOCX), react-markdown (MD), iframe (PDF).

---

### Task 1: Expose storage key + signed URL API

**Files:** `refind-demo/src/lib/api/materials.js`, tests

- Map `storageObjectKey` / `fileMimeType` on material
- `createMaterialSignedUrl(storageObjectKey, { expiresIn })`

### Task 2: Open original file button

**Files:** `MaterialPreviewPage.jsx`, styles, tests

### Task 3: Preserve text-file newlines in parse-material

**Files:** `supabase/functions/parse-material/index.ts`, extract tests

### Task 4: Markdown + TXT formatted body

**Files:** preview page, `react-markdown`, styles

### Task 5: PDF iframe viewer

**Files:** preview page, signed URL hook

### Task 6: DOCX mammoth HTML viewer

**Files:** preview page, mammoth + DOMPurify

### Task 7: PPTX/XLSX structured sections + open original emphasis

**Files:** extractDocumentText improvements optional; preview structured layout
