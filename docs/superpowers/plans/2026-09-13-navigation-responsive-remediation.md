# Navigation Responsive Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the global navigation truly collapsible and keep the homepage usable at desktop, tablet, and phone widths.

**Architecture:** Keep navigation state in `App.jsx`; expose a compact desktop/tablet icon rail and a mobile drawer from the same semantic sidebar. Keep responsive sizing in `src/styles.css`, with no change to Notes or knowledge-base business state.

**Tech Stack:** React 19, lucide-react, CSS, Vitest, Testing Library.

## Global Constraints

- Desktop expanded navigation shows icon and text; its toggle changes it to an icon rail.
- At 768–1199px, navigation is an actual 64px icon rail, not a wide empty sidebar.
- Below 768px, navigation is an off-canvas drawer opened by an accessible menu button and does not consume content width while closed.
- Icon-only controls have accessible names and visible hover/focus tooltips.
- Phone composer controls wrap or stack without horizontal clipping; interactive controls are at least 44px tall.
- Preserve existing notes, cards, knowledge-base, and AI demo state.

## Task 1: Implement responsive navigation and composer repairs

**Files:**
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/styles.css`
- Modify: `refind-demo/src/features/notes/NotesWorkspace.test.jsx`

- [x] **Step 1: Add failing UI tests**

Add tests asserting that the navigation toggle changes its accessible state, the mobile menu button opens the drawer, and each nav destination retains an accessible name in icon-only mode.

- [x] **Step 2: Verify the test fails**

Run: `npm run test:ui -- src/features/notes/NotesWorkspace.test.jsx`

Expected: failure because the toggle and mobile menu are absent.

- [x] **Step 3: Add the smallest stateful navigation controls**

Add `sidebarCollapsed` and `mobileNavOpen` state in `App.jsx`. Add a labelled toggle inside the sidebar and a labelled menu button outside it. Close the mobile drawer after selecting a destination. Add `aria-label` to every `NavItem` from its label.

- [x] **Step 4: Add breakpoint-specific layout rules**

At `max-width:1199px`, set the app grid to `64px minmax(0,1fr)` and hide non-essential sidebar text without removing accessible labels. At `max-width:767px`, make the grid one column; position the sidebar drawer above the content; display a 44px menu trigger; make the non-compact composer width `calc(100% - 32px)`, height auto, and its footer/actions wrap.

- [x] **Step 5: Verify automated checks**

Run: `npm run test:ui && npm run build && npm run test:sites`

Expected: every UI test, build, and Sites test passes.

- [x] **Step 6: Verify the three audit viewports**

Capture and inspect 1440×960, 1024×768, and 390×844 screenshots. Confirm desktop expanded/collapsed states, tablet 64px rail, phone drawer opening, no mobile horizontal clipping, and focusable labelled navigation controls.

## Plan Self-Review

- Coverage: toggle, tablet rail, mobile drawer, accessible names, and composer overflow each map to Task 1.
- Scope: this plan makes no change to AI range behavior or knowledge-base upload, which remain Task 7 in the first-phase plan.
- Ambiguity: the mobile drawer closes upon navigation so the selected destination receives the full viewport.

## Follow-up (2026-09-13)

- Implemented and verified in prototype; follow-on UI polish (full-bleed shell, black accents, folder KB icon, knowledge divider) recorded in `output/design.md` §10 and PRD §九.
- Next interaction plan: `docs/superpowers/plans/2026-09-13-menus-home-ai-material-preview.md`.
