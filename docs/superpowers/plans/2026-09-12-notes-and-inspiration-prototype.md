# Notes And Inspiration Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone, clickable HTML prototype for separate Notes and Inspiration Cards pages plus a full-page editor.

**Architecture:** The prototype is one static HTML file with in-browser state. A Notes page lists only notes. An Inspiration Cards page lists cross-library cards and exposes an explicit organize mode; both routes open the same independent editor route.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript.

## Global Constraints

- Preserve the Refind warm-white and dark-brown visual direction.
- Keep notes independent of knowledge-base ownership.
- Call saved answer fragments “灵感卡片”, never “洞见”.
- Do not add an infinite canvas.

---

### Task 1: Build the module shell and page routes

**Files:**
- Create: `.superpowers/brainstorm/9716-1789206090/content/notes-module-final.html`

**Interfaces:**
- Produces: `showPage(name)`, where `name` is `notes`, `cards`, or `editor`.

- [ ] **Step 1: Write the interaction contract**

```js
function showPage(name) {
  document.querySelectorAll('[data-page]').forEach((page) => {
    page.hidden = page.dataset.page !== name;
  });
}
```

- [ ] **Step 2: Implement the Notes and Inspiration Cards page shells**

Create distinct nav routes. The Notes route has only a note list; the Inspiration Cards route has only cards, filters, and the persistent “整理为笔记” action.

- [ ] **Step 3: Verify the navigation manually**

Open the prototype and confirm each nav route shows the correct page without mixing note and card collections.

### Task 2: Build the inspiration-to-editor flow

**Files:**
- Modify: `.superpowers/brainstorm/9716-1789206090/content/notes-module-final.html`

**Interfaces:**
- Consumes: `showPage(name)`.
- Produces: `toggleOrganizeMode()`, `toggleCard(id)`, and `openEditor(fromCards)`.

- [ ] **Step 1: Implement explicit organize mode**

The persistent “整理为笔记” action switches the cards page into selection mode before any checkboxes appear.

- [ ] **Step 2: Implement selection and editor handoff**

Keep the “开始整理” button visible in the selection toolbar and only enable it after at least one card is selected. Pass selected cards to the editor’s temporary source panel.

- [ ] **Step 3: Verify the handoff manually**

Select cards, start organizing, and confirm that the editor opens with those cards in its material panel.

### Task 3: Build the full-page editor and generation state

**Files:**
- Modify: `.superpowers/brainstorm/9716-1789206090/content/notes-module-final.html`

**Interfaces:**
- Consumes: `openEditor(fromCards)`.
- Produces: `generateDraft()` and `toggleMaterials()`.

- [ ] **Step 1: Implement the free-writing editor state**

Open a blank full-page editor from Notes. Keep the material panel closed until the user calls “添加灵感卡片”.

- [ ] **Step 2: Implement the card-assisted generation state**

Allow ordered temporary cards and editable “我的想法” fields, then replace only the editable document draft when `generateDraft()` is clicked.

- [ ] **Step 3: Verify all paths manually**

Confirm blank-note creation, card-assisted creation, panel collapse, draft generation, and return to Notes.
