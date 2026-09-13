# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current desktop-density preference: keep the three-column knowledge layout compact. Keep the knowledge-base materials column narrower than the AI conversation panel so the AI conversation remains the primary visual focus. The middle material list should prioritise title, tags, source and date in-row; **AI summary appears on hover**, not as a permanent second line. Clicking a material opens an in-app preview window with parsed title, summary, and body; links also offer「在原站打开」.

Homepage AI and knowledge-base AI are separate conversation stores. Homepage send must stay on the home canvas (collapse welcome hero, show thread); never navigate into the knowledge-base AI panel. Brand「拾藏」→ hero (keep last chat);「首页」→ restore chat if a session exists.「新增会话」clears bubbles but stays on the chat surface. History is a floating card (`#FCFCFB`) that can collapse to a FAB; expanded = thread left-aligned with composer; collapsed = centered equal margins. DeepSeek model chip opens 快速/深度 and shows `DS快速` / `DS深度`. Enter sends; Shift+Enter newline; default offline. Send button is black circular `#111`.

Answer actions order: copy → bookmark → share → more. Menus must sit above everything (portal / fixed, high z-index). Share enters bubble-selection mode on **both homepage and knowledge-base AI**, replaces the whole composer with「复制对话链接」+「取消」, uses flat left charcoal checks (no bright-blue wash), and **automatically exits to the conversation composer after a successful link copy**. Knowledge-base AI stream keeps comfortable top padding under the panel header so turns are not flush to the title bar.

All menus/popovers dismiss on outside click and Esc. After material ingest reaches `ready`, remove the queue card and restore the tools row.

Canonical docs: `output/design.md` §6 / §10, `output/Refind拾藏PRD_V1.0.md` §九, `output/Refind拾藏开发Spec_V1.0.md` §5.7 / §11, `docs/superpowers/specs/2026-09-13-prototype-interaction-amendments-design.md`, `docs/superpowers/specs/2026-09-13-notes-workspace-remediation-design.md`. Plans: menus/home preview (Task 1–5 done); notes remediation `docs/superpowers/plans/2026-09-13-notes-workspace-remediation.md` (pending).

Notes: 「我的笔记」与「灵感卡片」独立；新建全屏无素材面板；整理全屏有素材面板；双栏全屏 icon 在有素材时显示面板；返回到我的笔记并选中。

Sorting and source filtering use separate, lightweight controls with explanatory hover tooltips. Source filtering uses a single-select menu (all sources, Xiaohongshu, Douyin, WeChat, Zhihu, Bilibili, other); source filters, material keyword search, and either time or title sorting are applied together.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
