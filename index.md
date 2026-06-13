---
layout: default
title: CA (Contextual Anchor) — User Guide
---
# CA (Contextual Anchor) — User Guide

## 1. Overview

CA is a Chrome extension that lets you save text snippets ("anchors") from any Gemini chat and have them automatically injected into your prompts. Think of it as persistent context management for your AI conversations — anchors can be toggled on/off, set to expire after a number of turns or idle time, grouped into bundles for one-click context switching, and configured to appear only when your prompt contains specific trigger keywords.

**Key concepts:**

- **Anchor** — A saved text snippet with a turn counter (how many times it gets injected before expiring)
- **Template** — A reusable anchor blueprint you can activate to create new anchors
- **Bundle** — A group of anchors that can be toggled as a set (only one bundle active at a time)
- **Trigger keyword** — A word that must appear in your prompt for the anchor to inject
- **TTL (Time To Live)** — Idle expiry: if you don't use the anchor for X hours, it auto-disables

---

## 2. Installation

Install from the Chrome Web Store, or load unpacked:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select the extension folder
4. Navigate to `https://gemini.google.com` — the extension activates automatically

**Permissions explained:**

| Permission | Why needed |
|-----------|------------|
| `storage` | Save your anchors, templates, and bundles locally in Chrome |
| `contextMenus` | Show "Create Anchor" when you right-click selected text |
| `gemini.google.com` | The extension only runs on Gemini's chat interface |
| `raw.githubusercontent.com` | Fetches remote selector config for resilience when Gemini's UI changes |

---

## 3. The Side Panel

The side panel slides in from the right side of the Gemini chat page. To open it, hover over the right edge of the browser window — a blue bookmark icon appears. Click it to open the panel. You can also press **Alt+O** (customizable at `chrome://extensions/shortcuts`).

### Header Controls

| Icon | Action | Description |
|------|--------|-------------|
| <span class="ca-guide-dot ca-guide-dot--green"></span><span class="ca-guide-dot ca-guide-dot--yellow"></span><span class="ca-guide-dot ca-guide-dot--red"></span> | Health dot | Green = all good. Yellow = degraded. Red = Gemini UI changed — extension updating. |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> | Timeline | Opens the anchor timeline overlay with usage heatmap |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> | Lock | Pins the panel open — won't close when you click away |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> | Bulk select | Enters bulk mode — checkboxes appear on all items |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg> | Close | Closes the panel |

### Tabs

The panel has three tabs: **Anchors** (your saved snippets), **Templates** (reusable blueprints), and **Bundles** (anchor groups).

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><span class="ca-guide-dot ca-guide-dot--green"></span><span class="ca-guide-dot ca-guide-dot--yellow"></span><span class="ca-guide-dot ca-guide-dot--red"></span><span>Health</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Timeline</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><span>Lock</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg><span>Bulk</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg><span>Close</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><span>Anchors</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>Templates</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><span>Bundles</span></span>
> </div>

<img src="{{ '/assets/screenshots/section-3-side-panel.png' | relative_url }}" alt="Side Panel — full panel with header controls, tabs, and anchor list" style="max-width: 780px" loading="lazy">

---

## 4. Anchors

### Creating Anchors

There are four ways to create an anchor:

**A. Selection button (recommended)**

1. Highlight any text on the Gemini page
2. A blue bookmark button appears next to your selection
3. Click it to open the **turn popup**
4. Configure settings and click **Create**

**B. Context menu**

1. Highlight text on the page
2. Right-click → **Create Anchor**
3. Configure in the popup → click Create

**C. Keyboard shortcut** (`Alt+A`)

1. Copy text to your clipboard (Ctrl+C)
2. Press **Alt+A**
3. An anchor is created with 10 turns, TTL off, using the current page URL as source

**D. Bulk import**

1. Click **Import** in the anchors tab footer
2. Select a `.json` file (see Section 11 for format)

### The Turn Popup

When creating an anchor from selected text, a popup appears where you can configure:

| Field | Description | Default |
|-------|-------------|---------|
| **Turns** | How many times the anchor will inject before expiring | 10 |
| **TTL** | Idle expiry time — anchor disables if unused for X hours | Off |
| **Description** | Optional short label visible on the anchor card (max 80 chars) | (empty) |
| **Source URL** | Where the text came from (pre-filled with current page URL) | Current URL |

The popup **remembers** your last used turns and TTL settings — they're pre-selected next time.

<img src="{{ '/assets/screenshots/section-4-turn-popup.png' | relative_url }}" alt="Turn Popup — anchor creation with Turns, TTL, Description, Source URL fields" style="max-width: 780px" loading="lazy">

### Managing Anchors

Each anchor card shows:

| Element | What it tells you |
|---------|------------------|
| **Description** | Optional label, bold at the top of the card |
| **Text preview** | First few lines of the anchor text — click to expand |
| **Turns pill** | N/M — turns remaining / total. Orange when <=3 remaining. Red when expired. |
| **TTL pill** | <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6"/></svg> Xh — time remaining before idle expiry |
| **Tags** | #tagname chips — click a chip to remove the tag |
| **Usage** | "X uses" count |
| **Toggle switch** | Right side — green = active, grey = inactive. Click to flip. |

### Anchor Actions

| Button | Action |
|--------|--------|
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> **Copy** | Copies anchor text to clipboard |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg> **Inject** | Injects anchor text directly into the Gemini prompt at cursor |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> **Export** | Downloads anchor as a `.json` file |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> **Edit** | Opens the full editor overlay (see Section 7) |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> **Delete** | Moves anchor to Trash (soft-delete — recoverable) |

### Search, Sort &amp; Filter {#search-sort-filter}

Above the anchor list:

- **Search** — Filters by anchor text, source URL, or tags. Press **Escape** to clear.
- **Filter dropdown** — All / Active / Inactive / Expired / Global / **Trash**. Trash shows soft-deleted anchors with Restore and Delete Permanently buttons.
- **Sort dropdown** — Newest / Most Used / Recently Used

### Bulk Mode

Click the **<svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>** button in the header to enter bulk mode. Checkboxes appear on all anchors. A bulk action bar appears with:

| Action | What it does |
|--------|-------------|
| **Toggle** | Flips active/inactive on all selected |
| **+5** | Adds 5 turns to all selected |
| **Delete** | Soft-deletes all selected (moves to Trash) |
| **Export** | Exports selected anchors to `.json` |

<img src="{{ '/assets/screenshots/section-4-bulk-mode.png' | relative_url }}" alt="Bulk Mode — anchor list with checkboxes and bulk action bar" style="max-width: 780px" loading="lazy">

### Local vs Global

| Scope | Behavior |
|-------|----------|
| **Local** (default) | Anchor only works on the page where it was created |
| **Global** | Anchor works on any page — visible everywhere |

Click the **Local/Global** button on an anchor card to toggle. Global anchors show a blue left border.

### Tags &amp; Trigger Keywords {#tags-trigger-keywords}

**Tags** are labels for organization (e.g., `#css`, `#react`). They help you find anchors via search but don't affect injection.

**Trigger keywords** make an anchor inject **only when** the matching word appears in your prompt. For example, an anchor with trigger keyword `styling` will inject only when your prompt mentions "styling". An anchor with **no** trigger keywords always injects (when active with turns remaining).

Manage trigger keywords in the editor (Section 7) or add/remove them from the anchor card chips.

### Drag-and-Drop Reorder

You can reorder anchors by dragging them. Click and hold any anchor card, drag it above or below another, and release. The order swaps — anchors higher in the list inject first.

### Trash &amp; Recovery {#trash-recovery}

Deleting an anchor (via Delete button or bulk delete) moves it to Trash — not permanently removed. Switch the filter dropdown to **Trash** to see deleted items. Each shows:

- **Deleted Xh ago** timestamp
- **Restore** button — brings the anchor back to active lists
- **Delete Permanently** (trash icon) — removes it from disk entirely (requires confirmation)

Items in Trash for more than 7 days are automatically purged.

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg><span>Inject</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Export</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Edit</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="8" cy="12" r="4"/></svg><span>Toggle</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6"/></svg><span>TTL</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg><span>Global</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg><span>Bulk</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 5 17 10"/><line x1="12" y1="5" x2="12" y2="15"/></svg><span>Import</span></span>
> </div>

---

## 5. Templates

Templates are reusable anchor blueprints. When you **activate** a template, a new anchor is created from its text.

### Creating a Template

1. Switch to the **Templates** tab
2. Click **+ New Template** in the footer
3. Enter a name and text content
4. Optionally add tags and a description
5. Click **Save**

### Template Actions

| Button | Action |
|--------|--------|
| **Activate** | Creates a new anchor from the template text (10 turns, local). Usage count increments. |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> **Edit** | Opens the template editor |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> **Copy** | Copies template text to clipboard |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg> **Inject** | Injects template text into the prompt |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> **Export** | Downloads template as `.json` |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> **Delete** | Soft-deletes (recoverable via Trash) |

### Template Description

Templates support an optional description field. It appears below the template name on the card and is click-to-expand (like anchor text). Edit it in the template editor's description input.

### Bulk Template Operations

- Enter bulk mode, select templates, then **Activate** or **Delete** from the bulk bar
- Use **Export** in the bulk bar to export selected templates
- Use **Export All** in the footer to export all templates at once

### Search &amp; Sort {#search-sort}

- Search filters by name, text, or tags. **Escape** to clear.
- Sort by **Newest** or **Most Used**

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg><span>Inject</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Export</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Edit</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span>New</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6"/></svg><span>TTL</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg><span>Global</span></span>
> </div>

---

## 6. Bundles

Bundles group anchors together for **exclusive activation** — only one bundle can be active at a time. Activating a bundle turns on all its member anchors and turns off anchors from other bundles.

### Creating a Bundle

1. Switch to the **Bundles** tab
2. Click **+ New Bundle**
3. Enter a name, optional description, and optional trigger keyword
4. Check the anchors you want to include
5. Click **Create**

The **trigger keyword** is applied to all member anchors — they'll all use the same keyword for conditional injection.

### Bundle Card

| Element | What it shows |
|---------|--------------|
| **Name** | Bundle name |
| **Description** | Optional short description, click-to-expand |
| **Anchor count** | "N active / M anchors" |
| **Keyword chips** | Trigger keywords aggregated from member anchors |
| **Usage** | "X activations" counter |
| **Date** | Creation date |

### Bundle Actions

| Button | Action |
|--------|--------|
| **Activate / Active** | Right-side button — green when active. Activates this bundle (deactivates others). |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> **Edit** | Opens the bundle creator in edit mode |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> **Export** | Downloads bundle metadata + all member anchors as `.json` |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> **Delete** | Soft-deletes (moves to Trash, deactivates member anchors) |
| <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg> **Inject All** | Injects all member anchor texts joined by double newlines |

### Bundle Badge

When a bundle is active, the side panel trigger icon shows a **2-letter abbreviation** of the bundle name (e.g., "CO" for "Coding Style"). Hover for the full name. When no bundle is active, it shows the count of active anchors.

### Deactivating Bundles

Click **Deactivate All** in the bundle footer to deactivate all bundles and clear the bundle badge. The badge then shows the active anchor count.

<img src="{{ '/assets/screenshots/section-6-bundle-badge.png' | relative_url }}" alt="Bundle Badge — side panel trigger icon with abbreviation badge" style="max-width: 780px" loading="lazy">

### Bulk Bundle Operations

- Enter bulk mode to select and **Delete** bundles (with Export available)
- Use **Export All** in the footer to export all bundles with member anchor data

### Search &amp; Sort {#bundles-search}

- Search filters by name, description, or keyword. **Escape** to clear.
- Sort by **Newest** or **Most Used**

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Export</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Edit</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/><path d="M2 9l3-3M2 15l3 3"/></svg><span>Inject All</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><span>Bundles</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><span>New</span></span>
> </div>

---

## 7. The Editor

Clicking **Edit** on any anchor or template opens the full-screen editor overlay.

### Anchor Editor Layout

```
┌─ Edit Anchor ─────────────────────────── [<svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>] ─┐
│                                                │
│  Anchor: [Switch Anchor... <svg class="ca-guide-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>]                   │
│  [Description input]                             │
│  [Textarea — full anchor text]                   │
│                                                │
│  Sidebar:                                       │
│    Tags                                         │
│    Trigger Keywords                             │
│    Turns (display + extend + reset)             │
│    Status & Scope (active/inactive, global/local)│
│    TTL (display + extend + reset + remove)      │
│    Usage stats                                   │
│    Source URL                                    │
│    Meta (created date)                           │
│                                                │
│  Footer: [Delete] [Copy] [Inject] [Cancel] [Save]│
└────────────────────────────────────────────────┘
```

<img src="{{ '/assets/screenshots/section-7-editor-overlay.png' | relative_url }}" alt="Editor Overlay — full-screen editor with textarea and sidebar controls" style="max-width: 780px" loading="lazy">

### Anchor Switcher

The dropdown at the top lets you switch between all your anchors **without closing the editor**. Your current edits are auto-saved when you switch. Select "Switch anchor..." from the dropdown to pick a different anchor.

### Template Editor

The template editor is similar but adds a **Name** field at the top and shows an **Activate** button in the footer. Template editing includes description, tags, and usage stats.

### Editor Actions

| Button | Scope | Action |
|--------|-------|--------|
| **Delete** | Both | Deletes the anchor/template (confirmation dialog) |
| **Copy** | Both | Copies current textarea content to clipboard |
| **Inject** | Both | Injects current textarea content into the prompt |
| **Cancel** | Both | Closes editor without saving |
| **Save** | Both | Saves all changes and closes editor |
| **Activate** | Templates only | Creates a new anchor from the template text |

### TTL (Idle Expiry) Controls

TTL automatically deactivates an anchor if you haven't used it for a set number of hours. In the editor sidebar:

| Action | What it does |
|--------|-------------|
| **+1h / +6h / +24h** | Sets or extends TTL by that many hours |
| **Reset** | Resets TTL to the original full duration (requires a set TTL) |
| **Remove** | Removes TTL entirely — anchor stays active indefinitely |

**Note:** After removing TTL, the **+1h/+6h/+24h** buttons set a fresh TTL from the current time — they're never dead.

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg><span>Close</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg><span>Inject</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>Edit</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6"/></svg><span>TTL</span></span>
> </div>

---

## 8. The Timeline

The timeline overlay provides a visual history of your anchor usage. Open it via the <svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> button in the panel header or press **Alt+T**.

### Heatmap

The heatmap at the top shows your anchor activity over time. Each cell = one day. Click a day to filter the timeline to anchors used/created on that day.

| Control | Options |
|---------|---------|
| **Mode** | Usage (anchor use events) or Created (anchor creation dates) |
| **Color** | Blue or Green |
| **Range** | 3 Months, 6 Months, All Time |
| **Clear** | Clears the selected day filter |

<img src="{{ '/assets/screenshots/section-8-timeline-overlay.png' | relative_url }}" alt="Timeline Overlay — heatmap grid with mode/color/range controls and anchor cards" style="max-width: 780px" loading="lazy">

### Timeline Cards

Anchors are grouped by time period (Today, Yesterday, This Week, etc.). Each card shows:

- Status indicator (green/yellow/red dot)
- Anchor text preview
- Turns remaining pill + progress bar
- Tags, source domain, usage stats
- **Copy** and **Inject** action icons

Click any card to open the anchor editor.

### Timeline Bulk Mode

Enable bulk mode in the timeline header to select multiple anchors and **Toggle**, **+5**, or **Delete** them from the bulk bar.

> <div class="ca-guide-icon-block">
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>Timeline</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>Copy</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg><span>Inject</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg><span>Close</span></span>
> <span class="ca-guide-icon-block-item"><svg class="ca-guide-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg><span>Bulk</span></span>
> </div>

---

## 9. Injection &amp; Automation {#injection-automation}

### How Auto-Injection Works

When you press **Send** (or Enter) in Gemini:

1. All **active** anchors (toggle on, turns remaining) are collected
2. Each anchor's **trigger keywords** are checked against your prompt
3. Matching anchors are concatenated and injected into the prompt input
4. Each injected anchor loses 1 turn from its counter
5. Anchors reaching 0 turns are automatically deactivated
6. TTL expiry timers are reset (usage resets the idle clock)

### Injection Mode

The **Prepend / Append** toggle in the anchors toolbar controls where anchor text lands in your prompt:

| Mode | Behavior |
|------|----------|
| **Prepend** (default) | Anchor text goes before your prompt |
| **Append** | Anchor text goes after your prompt |

### Manual Injection

You can manually inject any anchor, template, or bundle at any time:

- Anchor card: **Inject** button
- Template card: **Inject** button
- Bundle card: **Inject All** button (all member anchor texts)
- Editor: **Inject** button (injects current textarea content)
- Timeline: **Inject** icon on any card

Manual injection does **not** decrement turns — it bypasses the turn counter.

### Trigger Keywords

Trigger keywords are per-anchor filter words. An anchor with `styling` as a trigger keyword:

- Injects when your prompt contains "styling" (case-insensitive)
- Does **not** inject when your prompt is about something else

An anchor with **no** trigger keywords (empty list) always injects when active. Set trigger keywords in the editor sidebar.

---

## 10. Slash Commands

While typing in the Gemini prompt, you can use slash commands to search and inject anchors without leaving the keyboard:

| Command | What it does |
|---------|-------------|
| `/a search` | **Append** — inserts matching anchor text after your prompt |
| `/p search` | **Prepend** — inserts matching anchor text before your prompt |

Type `/a` or `/p` followed by a space, then a few characters of the anchor text or tag. A dropdown appears with matching anchors. Use **↑↓** to navigate, **Enter** to insert. **Escape** dismisses. If no search term, shows your 10 most-used anchors.

<img src="{{ '/assets/screenshots/section-10-slash-commands.png' | relative_url }}" alt="Slash Commands — dropdown in chat input showing matching anchors" style="max-width: 780px" loading="lazy">

---

## 11. Data Management

### Export All

Each tab has an **Export All** button in its footer:

- **Anchors tab** → `ca-backup-{timestamp}.json` (all anchors, templates, bundles)
- **Templates tab** → `ca-templates-{timestamp}.json` (all templates)
- **Bundles tab** → `ca-bundles-{timestamp}.json` (all bundles with member anchor data)

### Per-Item Export

Every anchor, template, and bundle card has an **Export** button (<svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>) for single-item export. In bulk mode, use the **Export** button in the bulk bar to export only selected items.

### Import

Click **Import** in the anchors tab footer and select a `.json` file. The importer:

- Creates new anchors/templates/bundles from the file
- Skips duplicates (matched by text content for anchors)
- Remaps anchor IDs so bundle references stay intact
- Preserves tags, trigger keywords, descriptions, TTLs, and usage history
- Shows a summary in the console

### Trash &amp; Recovery {#data-trash}

All deletes are **soft-deletes** — items move to Trash, not permanently deleted. See the "Trash & Recovery" section under Anchors (Section 4) for how to restore or permanently delete items. Items in Trash for more than 7 days are automatically purged.

---

## 12. Keyboard Shortcuts

<img src="{{ '/assets/screenshots/section-12-keyboard-shortcuts.png' | relative_url }}" alt="Keyboard Shortcuts — the built-in ? key reference overlay" style="max-width: 780px" loading="lazy">

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Tip:** You don't need to memorize these. Press **?** at any time to see the full reference on your screen.

### Save and manage your notes

| To do this… | Press this | What to expect |
|---|---|---|
| Save text you just copied | **Alt + A** | A short confirmation message appears. |
| Turn bulk mode on or off | **Alt + B** | Checkboxes appear on every item. |
| See your usage history | **Alt + T** | A timeline overlay opens. |

### Open and move around

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Shortcuts do not respond while you're typing in a text field.** This prevents them from interfering with your writing. Click a blank area of the page first, then try the shortcut again.

| To do this… | Press this | What to expect |
|---|---|---|
| Open or close the side panel | **Alt + O** | The panel opens. The search box is ready to type in. |
| Switch to the Anchors tab | **Alt + 1** | |
| Switch to the Templates tab | **Alt + 2** | |
| Switch to the Bundles tab | **Alt + 3** | |
| Switch to the Constraints tab | **Alt + 4** | |
| Open the behavior editor | **Alt + E** | |
| Show or hide the minimap | **Alt + M** | Works even while you're typing. |
| Jump to the search box | **/** | Start typing immediately. |
| Close any open window | **Escape** | Closes the panel, editor, dropdown, or popup. |
| Show this reference on screen | **?** | |

### Type commands in your message

Search your saved notes from inside the Gemini chat box — no need to open the side panel.

**Before you start:** Click into the Gemini chat box where you type your message.

| Command | What it does |
|---|---|
| **/a keyword** | Inserts the note's text at your cursor. |
| **/p keyword** | Inserts the note's text at the beginning of your message. |

**How to use a slash command:**

1. Type **/a** or **/p** followed by a **space**.
2. A dropdown appears showing notes that match what you typed.
   - Type nothing after the space and it shows your 10 most-used notes.
3. Press **↓** or **↑** to move through the list.
4. Press **Enter** to select the highlighted note.
   - Its text appears in your message automatically.
5. Press **Escape** to close the dropdown without inserting anything.

### Navigate the minimap anchor list

The minimap has a grouped list of all your notes in the current chat.

**To open the list:**
1. Hover over the minimap.
2. Click the **#** button that appears.
3. The list stays open and centered on your screen.

| Key | What it does |
|---|---|
| **↓** or **↑** | Move down or up one item. |
| **Enter** | Scrolls to that note's location on the page. |
| **Escape** | Closes the list. |

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> Click the **lock icon** to keep the list open even when your mouse moves away. Click the **×** button to close it manually.

### Add tags faster

When typing tags on a note or template, type **#** to see suggestions based on tags you have used before.

| Key | What it does |
|---|---|
| **↓** or **↑** | Move through the suggestion list. |
| **Enter** | Adds the highlighted suggestion as a tag. |
| **Escape** | Hides the suggestion list. |

### Use your mouse

| Action | How to do it |
|---|---|
| Save text as a note | Highlight any text, then **right-click** → **Create Anchor**. The editor opens ready to fill in. |
| Reorder your notes | Click and hold a note in the side panel. Drag it up or down. |

### Work in editors and dialogs

These shortcuts work while an editor or a dialog window is open.

| Key | What it does |
|---|---|
| **Escape** | Closes the current editor. Your changes save automatically. |
| **Escape** | Dismisses a confirmation dialog (such as deleting an item). |
| **Escape** | Closes the timeline overlay. |
| **Enter** | Adds the tag you typed (in a tag input field). |
| **Enter** | Confirms an action (in a dialog). |
| **Tab** | Moves forward through buttons and fields. |
| **Shift + Tab** | Moves backward through buttons and fields. |

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Tip:** If you press Escape and nothing happens, a different dialog may be open underneath. Press Escape again or click outside the dialog.

### Change your shortcuts

You can change four shortcuts to keys that feel more natural to you:
**Alt + A**, **Alt + O**, **Alt + T**, and **Alt + B**.

**Before you start:** Open a new browser tab.

1. Type `chrome://extensions/shortcuts` into your browser's address bar. Press **Enter**.
2. Find **Contextual Anchor** in the list.
3. Click the **pencil icon** (<svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>) next to the shortcut you want to change.
4. Press the new key combination you want to use.
5. The change takes effect right away. No restart needed.

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> **The Everyday shortcuts (/, ?, Alt + 1–4, Alt + E, and Alt + M) cannot be changed.** They are fixed.

---

## 13. Troubleshooting

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Start here:** Two things fix most problems. (1) Make sure you are on **gemini.google.com**. (2) **Reload** the page.

### Quick health check

| Dot color | What it means | What to do |
|---|---|---|
| <span class="ca-guide-dot ca-guide-dot--green"></span> Green | Everything is working. | Nothing needed. |
| <span class="ca-guide-dot ca-guide-dot--yellow"></span> Yellow | Some features may be limited. | Gemini's layout probably changed slightly — most things still work. |
| <span class="ca-guide-dot ca-guide-dot--red"></span> Red | The extension cannot find the parts of Gemini it needs. | Reload the page. If it stays red, the extension will check for updates automatically. Wait about an hour, then reload again. |

### Common problems

| Problem | Things to check | How to fix |
|---|---|---|
| Your note does not appear in your message | • Is the note turned **on**? (The switch should be green) • Does it have **uses left**? (The number should be more than 0) • Does it have **trigger words**? Your message must include one of them • Is the note **global** or was it saved on the current page? • Did you set a **time limit**? It may have run out • Did the note run out of uses and turn itself off? • Is the correct **bundle** active? Check the Bundles tab • Is it set to the right **mode**? (Prepend, Append, or Intermittent) • Did you type something in your message? (Nothing to insert into) | Open the note's editor to check these settings. Turn the switch on, add uses, adjust trigger words, or check the active bundle in the Bundles tab. |
| The extension icon is missing | • Are you on **gemini.google.com**? (Subdomains like app.gemini.google.com will not work) • Is the extension **enabled** in your browser? | Go to gemini.google.com. Open `chrome://extensions` and check that Contextual Anchor is enabled. Then reload the page. |
| Shortcuts are not responding | • Are you **typing in a text field**? Shortcuts pause while you type. • Is **another extension** using the same key combination? | Click a blank area of the page, then try the shortcut again. To check for conflicts, go to `chrome://extensions/shortcuts`. |
| Slash commands do not work | • Is your cursor inside the Gemini chat box? • Did you type a **space** after **/a** or **/p**? | Click into the chat box. Make sure there is a space after the command. |
| A window will not close | • Have you pressed **Escape** more than once? Escape closes the most recent window first. • Is the **minimap list pinned**? (A blue lock icon means it is pinned open) | Press Escape again to close the next layer. Click the lock icon or the **×** button to unpin the minimap list. |
| Your note stopped appearing even though it has uses left | • Did its **time limit** (TTL) run out? • Did you accidentally **switch bundles**? | Open the note's editor to check the timer. Look at the Bundles tab to see which bundle is active. |

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Before you uninstall:** Export your data first. Click the **Export** button at the bottom of the Anchors tab to save everything as a `.json` file. You can import it back if you reinstall.

> <svg class="ca-guide-icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> **Still stuck?** Open the browser's developer tools (**F12**), click the **Console** tab, and look for any line starting with `[CA]`. Those lines show what the extension is doing. If you need help, include those lines when you report the issue.


---

## 14. Icon Reference {#icon-reference}

This table lists every icon used in the extension. Use it as a quick lookup when the guide mentions an icon by name.

| Icon | Name | Description |
|---|---|---|
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
</svg> | **Anchor** | Represents saved anchors. Appears on the Anchors tab and the side panel trigger button. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
<polyline points="14 2 14 8 20 8"/>
<line x1="16" y1="13" x2="8" y2="13"/>
<line x1="16" y1="17" x2="8" y2="17"/>
</svg> | **Template** | Represents reusable anchor blueprints. Appears on the Templates tab. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
</svg> | **Bundle** | Represents anchor groups for exclusive activation. Appears on the Bundles tab. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
</svg> | **Constraints** | Filter and constraint management. Appears on the Constraints tab. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<rect x="3" y="3" width="7" height="7" rx="1"/>
<rect x="14" y="3" width="7" height="7" rx="1"/>
<rect x="3" y="14" width="7" height="7" rx="1"/>
<rect x="14" y="14" width="7" height="7" rx="1"/>
</svg> | **Timeline** | Opens the anchor timeline overlay with usage heatmap. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<rect x="3" y="11" width="18" height="11" rx="2"/>
<path d="M7 11V7a5 5 0 0110 0v4"/>
</svg> | **Lock** | Pins the side panel open so it will not close when you click away. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<rect x="3" y="3" width="18" height="18" rx="2"/>
<path d="M9 12l2 2 4-4"/>
</svg> | **Bulk Select** | Enters bulk mode. Checkboxes appear on all items for batch operations. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M18 6L6 18M6 6l12 12"/>
</svg> | **Close** | Closes the panel, editor, timeline, or any open overlay. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<rect x="9" y="9" width="13" height="13" rx="2"/>
<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
</svg> | **Copy** | Copies anchor or template text to your clipboard. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M5 12h13M12 5l7 7-7 7"/>
</svg> | **Inject** | Inserts anchor text directly into the Gemini prompt at your cursor. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M5 12h13M12 5l7 7-7 7"/>
<path d="M2 9l3-3M2 15l3 3"/>
</svg> | **Inject All** | Injects all member anchor texts from a bundle joined by double newlines. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
</svg> | **Edit** | Opens the full-screen editor overlay for anchors, templates, or bundles. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
</svg> | **Delete** | Moves an item to Trash. Soft-delete, recoverable within 7 days. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
<polyline points="7 10 12 15 17 10"/>
<line x1="12" y1="15" x2="12" y2="3"/>
</svg> | **Export** | Downloads an anchor, template, or bundle as a .json file. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
<polyline points="7 10 12 5 17 10"/>
<line x1="12" y1="5" x2="12" y2="15"/>
</svg> | **Import** | Imports anchors, templates, or bundles from a .json file. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<rect x="1" y="5" width="22" height="14" rx="7"/>
<circle cx="8" cy="12" r="4"/>
</svg> | **Toggle** | Switches an anchor on (green) or off (grey). Appears on anchor cards. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="10"/>
<line x1="12" y1="8" x2="12" y2="16"/>
<line x1="8" y1="12" x2="16" y2="12"/>
</svg> | **Add / New** | Creates a new template, bundle, or constraint. Appears in tab footers. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6"/>
</svg> | **TTL** | Idle expiry timer. Auto-disables an anchor if unused for a set number of hours. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<circle cx="12" cy="12" r="10"/>
<line x1="2" y1="12" x2="22" y2="12"/>
<path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
</svg> | **Global** | Makes an anchor visible on all pages, not just where it was created. |
| <svg class="ca-guide-icon-lg" viewBox="0 0 24 24">
<path d="M12 2L15 9l7 1-5 5.5L18 22l-6-3.5L6 22l1-6.5L2 10l7-1z"/>
</svg> | **Pin** | Pins a constraint or keeps the minimap list open when your mouse moves away. |
| <span class="ca-guide-dot ca-guide-dot--green"></span><span class="ca-guide-dot ca-guide-dot--yellow"></span><span class="ca-guide-dot ca-guide-dot--red"></span> | **Health** | Extension status indicator. Green = all good, yellow = degraded, red = Gemini UI changed. |
