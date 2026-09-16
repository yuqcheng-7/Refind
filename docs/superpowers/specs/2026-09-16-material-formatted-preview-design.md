# Material formatted preview design

Date: 2026-09-16  
Status: approved (user: 一步一步都修改掉)

## Goal

Preview page for uploaded files should preserve original formatting as much as practical, instead of plain extracted paragraphs only.

## Approach (chosen)

**Client-side typed viewers + Storage signed URLs.** Keep `content_text` for RAG; render formatted preview from the original blob when possible.

| Type | Preview | Fallback |
|------|---------|----------|
| PDF | `<iframe>` / embed via signed URL | Extracted text |
| Markdown / TXT | Render markdown / preformatted text (preserve newlines at parse) | — |
| DOCX | `mammoth` → sanitized HTML | Extracted text |
| PPTX / XLSX | Structured text sections + **打开原文件** | Same |
| All files with storage key | **打开原文件** button (signed URL) | — |

## Non-goals (this pass)

- Server LibreOffice → PDF conversion
- Microsoft/Google Office Online iframe
- Editing documents in-app
- New DB columns (`content_html`) — deferred; client converts on demand

## Security

- Private `materials` bucket; signed URLs short-lived (e.g. 1 hour)
- HTML from mammoth sanitized before `dangerouslySetInnerHTML`
- Only owner can create signed URLs (existing storage RLS)

## UX

- Header tools: 重新解析 · 打开原文件 (files) · 回到原文 (links)
- Formatted viewer above or instead of plain「原文」when available
- Plain extracted text remains available as secondary section when a formatted viewer is shown (label: 提取文本) so RAG/debug stays transparent
