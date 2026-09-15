# Phase 2 Final-Fix Report

Date: 2026-09-13

## Fixed findings

- URL material parsing retains DNS private-address validation and now applies a 10-second request timeout, a 2 MiB streamed response limit, and an allowlist of `text/html`, `text/plain`, and `application/xhtml+xml` response types before reading a URL body.
- The Deno Edge runtime's normal `fetch()` resolves the hostname itself, so the validated address cannot be pinned to the TCP connection in this Phase 2 implementation. DNS rebinding therefore remains a residual infrastructure risk; a connector/proxy that resolves and connects to the validated IP is required for complete mitigation.
- Failed ingest work after server-stub creation retains the server material ID, so retry reuses that material and delete targets the persisted record. Missing knowledge-base selection now fails visibly.
- Note-material persistence rethrows errors after displaying the failure notice. Optimistic attachment updates only apply after persistence succeeds.
- Deleting an inspiration card removes its ID and associated thought from all locally loaded notes.
- Note-to-knowledge-base sync no longer reports a simulated success. The dialog and action explicitly defer it to Phase 3.
- `design-qa.md` now marks all Docker/Supabase-dependent verification as **BLOCKED**, not deferred or passed.

## Verification

| Command | Result |
| --- | --- |
| `npm run test:ui` | Passed: 13 files, 74 tests |
| `npm run build` | Passed; Sites artifacts prepared |
| `deno check supabase/functions/parse-material/index.ts` | BLOCKED: `deno` is not installed in this environment |

The production build emits Rollup's existing large-chunk warning; it does not fail the build.

## Remaining blocked validation

Live Docker/Supabase verification remains blocked in this workspace. Before release, run the Phase 2 acceptance checklist with `supabase start`, real Edge Function execution, Storage, Auth, and two users for RLS checks.
