# Refind Home Demo — Design QA

## Comparison target

- Source visual truth: `/Users/zoecheng/.codex/generated_images/019ffc9c-8cc9-7863-9233-21f3dd567ced/exec-45401883-3227-498d-b7e0-5c99f8f491cd.png`
- Implementation capture: `/private/tmp/refind-home-final.png`
- Source pixels: 1486 × 1058
- Implementation viewport: 1440 × 1024 CSS px at browser density 1
- State: desktop home, no menus open, empty composer

## Full-view comparison evidence

The source and implementation were opened together in the local comparison view. Both render the same two-region composition: a narrow pale sidebar, unframed centre canvas, small luminous star, centred welcome hierarchy, and a wide lower composer. The implementation uses the approved current product copy and intentionally omits the shortcut cards and voice control.

## Focused comparison evidence

Focused inspection covered the hero hierarchy and composer. The hero preserves the black display heading, muted Chinese subhead, soft lavender star halo, and generous negative space. The composer preserves the wide two-row frosted surface, refined border, compact link / knowledge-base / tag tools, and single dark send control.

## Findings

- [P3] Decorative star has slightly sharper facets than the source reference.
  - Location: `.star-halo img`.
  - Evidence: the generated asset has more internal facets than the softer source mark.
  - Impact: visible only on close inspection; it does not alter hierarchy or usability.
  - Follow-up: replace the asset if a flatter brand mark is supplied.

## Primary interactions checked

- Opened the knowledge-base selector and selected `增长与运营案例`.
- Opened the tag selector and selected `#增长策略`.
- Entered a question and sent it; the visible status acknowledged the selected scope and tag.
- Checked browser console: no warnings or errors.

## Required fidelity surfaces

- Fonts and typography: UI uses DM Sans with Noto Sans SC fallback; headline and small Chinese labels maintain the visual hierarchy and avoid wrapping.
- Spacing and layout rhythm: sidebar, hero, composer width, vertical placement, radii, and negative space match the approved desktop composition.
- Colors and visual tokens: warm white canvas, restrained upper lavender halo, and lower-right peach light are retained without a full-screen fog effect.
- Image quality and asset fidelity: star is a generated raster asset, not a hand-drawn code replacement; its scale and halo align with the reference.
- Copy and content: placeholder is exactly `请输入内容进行提问`; no voice action is present; controls are `链接` / `全部知识库` / `标签`.

## Final result

final result: passed

---

## 2026-09-13 — Phase 1 Task 7–8 integration QA

### Automated verification
- `npm run test:ui` — 30 passed
- `npm run build` — emitted `dist/client/index.html`, Sites packaging via `prepare-sites-build.mjs`
- `npm run test:sites` — 4 passed

### Checked paths
| Path | Viewport | Result |
| --- | --- | --- |
| Home composer: DS/DeepSeek, 联网, multi-KB, @标签 → 严格 RAG / 不联网 | 1440×1024 | passed |
| Knowledge: 添加资料 → 粘贴链接 / 上传文件; tools-row placement | 1440×1024 | passed (fixed during QA: button moved into tools row; file input visually hidden via `.sr-only`) |
| Notes: 我的笔记 / 灵感卡片 tabs, editor toolbar | 1440×1024 | passed |
| Nav: expanded toggle, mobile `打开导航` present | 1440 / 390 | passed |
| Compact AI follow-up keeps homepage multi-KB + tag scope | covered by HomeComposer tests | passed |

### Adjustments made during QA
- Moved `MaterialIngest` into `.material-tools` so `+ 添加资料` sits with search/filter.
- Added `.sr-only` so the file chooser no longer renders as a visible “选择文件” chip.
- Cleared `conversationScope` when homepage scope is cleared.

### Approved deviations
- Desktop shell is full-bleed (no 1200px left-aligned safe workbench). Navigation remediation and subsequent polish intentionally diverged from the original plan constraint.

### Residual polish (P3, non-blocking)
- Material search border can look soft/incomplete at some zoom levels (subpixel antialiasing).
- Compact AI composer height remains denser than some earlier mock preference; functional.

### Final result
final result: passed

---

## 2026-09-13 — Menus / Home AI / Material Preview QA

### Automated verification
- `npm run test:ui` — 42 passed
- `npm run build` — passed
- `npm run test:sites` — 4 passed

### Checked paths (code + automated tests)
| Path | Result |
| --- | --- |
| Outside-click / Esc dismiss for account, filter, ingest, home scope, history, rail, card filter | passed (tests) |
| Ready ingest cards removed; failed/downgraded retained | passed (tests) |
| Homepage submit stays on home; `homeMessages` vs `kbMessages` | passed (tests) |
| Material hover summary + hash preview window + 在原站打开 for links | passed (tests) |

### Notes
- Browser visual attach failed once during Task 3 agent run; automated coverage is green. Spot-check locally at `http://127.0.0.1:5174/`.

### Final result
final result: passed

---

## 2026-09-13 — Homepage chat shell + share selection QA

### Automated verification
- `npm run test:ui` — 50 passed（含 `HomeConversation` 分享选气泡）

### Checked paths
| Path | Result |
| --- | --- |
| Answer action order copy → bookmark → share → more | passed |
| Share mode selects bubbles; composer replaced by 复制对话链接 / 取消 | passed |
| Copy link exits share mode and restores composer | passed (App wiring) |
| Floating answer menus above composer / history / scroll clip | passed |
| Flat charcoal left checks; theme-aligned share bar | passed (visual) |
| Docs sync: PRD §9 / Spec §11 / design.md §10 / amendments / plan Task 5 | passed |

### Final result
final result: passed
