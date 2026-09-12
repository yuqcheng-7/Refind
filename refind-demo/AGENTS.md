# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current desktop-density preference: keep the three-column layout compact. Keep the knowledge-base sidebar narrower than the AI conversation panel so the AI conversation remains the primary visual focus. The middle material list should prioritise title, tags, source and date rather than a visible summary, while the AI conversation panel should receive comparatively more horizontal space. Sorting and source filtering use separate, lightweight icon-only controls (not a shared capsule) with explanatory hover tooltips. Source filtering uses the ListFilter icon and a single-select menu (all sources, Xiaohongshu, Douyin, WeChat, Zhihu, Bilibili, other); source filters, material keyword search, and either time or title sorting are applied together.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
