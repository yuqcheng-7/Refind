# Refind Poe Deep Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Refind home, notes, and knowledge-base workspace with the supplied Poe reference while retaining the agreed product flows.

**Architecture:** Keep the existing Vite/React single-page demo and add route-like view state for Home, Notes, and Knowledge Base. A single token-based stylesheet will provide the Poe-inspired airy surface, right-bottom ambient gradient, frosted panels, and responsive composer positioning.

**Tech Stack:** React 19, Vite 6, lucide-react, CSS.

## Global Constraints

- Keep all visible product copy in Chinese, except the approved home heading “Welcome, Refind!”.
- Preserve create-knowledge-base, link save, knowledge-base selection, tag selection, AI answer, chat history, and citation interaction as demo flows.
- Do not include a voice-input feature.
- Treat the supplied Poe HTML as visual/layout reference only; Refind functionality remains governed by its own PRD.

---

### Task 1: Correct the home composer’s responsive vertical anchor

**Files:**
- Modify: `refind-demo/src/styles.css`
- Test: `refind-demo` production build and Sites worker test

- [ ] Replace the fixed `bottom: 300px` composer position with a viewport-aware custom property.
- [ ] Align the toast position to the new composer anchor so the two never overlap.
- [ ] Run `npm run build` and `npm run test:sites` in `refind-demo`.

### Task 2: Add Poe-consistent Notes view

**Files:**
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/styles.css`
- Test: `refind-demo` production build and Sites worker test

- [ ] Render a notes workspace when the sidebar “笔记” item is selected.
- [ ] Include search, create note, a concise list, selected-note preview, and save feedback.
- [ ] Use quiet surfaces and a single floating panel instead of the former dense card grid.

### Task 3: Add Poe-consistent knowledge-base detail and AI view

**Files:**
- Modify: `refind-demo/src/App.jsx`
- Modify: `refind-demo/src/styles.css`
- Test: `refind-demo` production build and Sites worker test

- [ ] Render knowledge-base selection, material rows, source filter/sort controls, and add-link feedback.
- [ ] Render a right-side AI conversation panel with new-chat/history actions and citation chips.
- [ ] Make citations reveal their source material on hover/focus and allow an answer to be saved into a note.
- [ ] Run `npm run build` and `npm run test:sites` in `refind-demo`.

