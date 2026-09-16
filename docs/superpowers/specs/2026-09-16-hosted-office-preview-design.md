# Hosted Office → PDF (production)

Date: 2026-09-16  
Status: in progress

## Problem

Local Microsoft Office / LibreOffice via `platform-parser` only works on the developer machine. Production users must not depend on installed desktop apps.

## Production path (required)

```
User uploads PPT/XLSX
  → Storage (original)
  → parse-material Edge Function
  → OFFICE_CONVERT_URL (hosted Gotenberg / LibreOffice)
  → upload *.preview.pdf to Storage
  → materials.preview_storage_object_key
Material preview
  → signed URL of preview PDF only
```

All users see the same stored preview PDF. No per-client Office install.

## Convert service

Default: **Gotenberg** (`gotenberg/gotenberg`) Docker image.

```bash
cd tools/office-convert && docker compose up -d
# local: http://127.0.0.1:3000
```

Edge secret (production, must be publicly reachable from Supabase Tokyo):

```bash
npx supabase secrets set OFFICE_CONVERT_URL=https://convert.your-domain.com
# optional: OFFICE_CONVERT_ENGINE=gotenberg
```

## Local / offline fallback

- `DEV` + `VITE_PLATFORM_PARSER_URL`: browser may still convert via local parser (PowerPoint preferred) for developer convenience.
- Production builds: **no** client-side convert; missing preview → structured text +「重新解析」/「打开原文件」。

## Fidelity note

Hosted LibreOffice/Gotenberg is good enough for most decks, not pixel-perfect vs PowerPoint. Prefer「打开原文件」when exact layout matters. Optional later: CloudConvert / OnlyOffice for higher fidelity.
