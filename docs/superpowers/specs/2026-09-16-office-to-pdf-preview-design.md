# PPT/Excel → PDF preview conversion

Date: 2026-09-16  
Status: approved (user: ok)

## Goal

In-app preview for PPTX / XLSX should match original layout approximately by converting to PDF, then reusing the existing PDF iframe viewer.

## Architecture

```
parse-material (Edge)
  → download original from Storage
  → extract text (RAG, unchanged)
  → POST OFFICE_CONVERT_URL|/convert-office (platform-parser)
  → upload PDF to materials bucket as preview key
  → materials.preview_storage_object_key = …
MaterialPreviewPage
  → if preview_storage_object_key → PDF iframe
  → else structured text + 打开原文件
```

## Why platform-parser

Supabase Edge (Deno) cannot run LibreOffice. The existing `tools/platform-parser` (Python, hostable) already sits outside Edge for CN parsing; add `POST /convert-office` that shells `soffice --headless --convert-to pdf`.

Env: `PLATFORM_PARSER_URL` / `OFFICE_CONVERT_URL` on Edge secrets; local default `http://127.0.0.1:8787`.

## Schema

```sql
alter table public.materials
  add column if not exists preview_storage_object_key text;
```

## Failure mode

If LibreOffice missing or convert fails: keep text extraction + structured preview; do not fail the whole parse (`ready` with text still OK). Log `last_parse_error` only as soft warning or leave empty.

## Non-goals

OnlyOffice, CloudConvert SaaS, editing, animation fidelity.
