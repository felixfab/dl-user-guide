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
| 🟢/🟡/🔴 | Health dot | Green = all good. Yellow = degraded. Red = Gemini UI changed — extension updating. |
| ▦ | Timeline | Opens the anchor timeline overlay with usage heatmap |
| 🔒 | Lock | Pins the panel open — won't close when you click away |
| ☑ | Bulk select | Enters bulk mode — checkboxes appear on all items |
| ✕ | Close | Closes the panel |

### Tabs

The panel has three tabs: **Anchors** (your saved snippets), **Templates** (reusable blueprints), and **Bundles** (anchor groups).

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

### Managing Anchors

Each anchor card shows:

| Element | What it tells you |
|---------|------------------|
| **Description** | Optional label, bold at the top of the card |
| **Text preview** | First few lines of the anchor text — click to expand |
| **Turns pill** | N/M — turns remaining / total. Orange when <=3 remaining. Red when expired. |
| **TTL pill** | ⧗ Xh — time remaining before idle expiry |
| **Tags** | #tagname chips — click a chip to remove the tag |
| **Usage** | "X uses" count |
| **Toggle switch** | Right side — green = active, grey = inactive. Click to flip. |

### Anchor Actions

| Button | Action |
|--------|--------|
| 📋 **Copy** | Copies anchor text to clipboard |
| ➡️ **Inject** | Injects anchor text directly into the Gemini prompt at cursor |
| ⬇️ **Export** | Downloads anchor as a `.json` file |
| ✏️ **Edit** | Opens the full editor overlay (see Section 7) |
| 🗑 **Delete** | Moves anchor to Trash (soft-delete — recoverable) |

### Search, Sort &amp; Filter {#search-sort-filter}

Above the anchor list:

- **Search** — Filters by anchor text, source URL, or tags. Press **Escape** to clear.
- **Filter dropdown** — All / Active / Inactive / Expired / Global / **Trash**. Trash shows soft-deleted anchors with Restore and Delete Permanently buttons.
- **Sort dropdown** — Newest / Most Used / Recently Used

### Bulk Mode

Click the **☑** button in the header to enter bulk mode. Checkboxes appear on all anchors. A bulk action bar appears with:

| Action | What it does |
|--------|-------------|
| **Toggle** | Flips active/inactive on all selected |
| **+5** | Adds 5 turns to all selected |
| **Delete** | Soft-deletes all selected (moves to Trash) |
| **Export** | Exports selected anchors to `.json` |

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
| ✏️ **Edit** | Opens the template editor |
| 📋 **Copy** | Copies template text to clipboard |
| ➡️ **Inject** | Injects template text into the prompt |
| ⬇️ **Export** | Downloads template as `.json` |
| 🗑 **Delete** | Soft-deletes (recoverable via Trash) |

### Template Description

Templates support an optional description field. It appears below the template name on the card and is click-to-expand (like anchor text). Edit it in the template editor's description input.

### Bulk Template Operations

- Enter bulk mode, select templates, then **Activate** or **Delete** from the bulk bar
- Use **Export** in the bulk bar to export selected templates
- Use **Export All** in the footer to export all templates at once

### Search &amp; Sort {#search-sort}

- Search filters by name, text, or tags. **Escape** to clear.
- Sort by **Newest** or **Most Used**

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
| ✏️ **Edit** | Opens the bundle creator in edit mode |
| ⬇️ **Export** | Downloads bundle metadata + all member anchors as `.json` |
| 🗑 **Delete** | Soft-deletes (moves to Trash, deactivates member anchors) |
| ➡️ **Inject All** | Injects all member anchor texts joined by double newlines |

### Bundle Badge

When a bundle is active, the side panel trigger icon shows a **2-letter abbreviation** of the bundle name (e.g., "CO" for "Coding Style"). Hover for the full name. When no bundle is active, it shows the count of active anchors.

### Deactivating Bundles

Click **Deactivate All** in the bundle footer to deactivate all bundles and clear the bundle badge. The badge then shows the active anchor count.

### Bulk Bundle Operations

- Enter bulk mode to select and **Delete** bundles (with Export available)
- Use **Export All** in the footer to export all bundles with member anchor data

### Search &amp; Sort {#bundles-search}

- Search filters by name, description, or keyword. **Escape** to clear.
- Sort by **Newest** or **Most Used**

---

## 7. The Editor

Clicking **Edit** on any anchor or template opens the full-screen editor overlay.

### Anchor Editor Layout

```
┌─ Edit Anchor ─────────────────────────── [✕] ─┐
│                                                │
│  Anchor: [Switch Anchor... ▾]                   │
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

---

## 8. The Timeline

The timeline overlay provides a visual history of your anchor usage. Open it via the ▦ button in the panel header or press **Alt+T**.

### Heatmap

The heatmap at the top shows your anchor activity over time. Each cell = one day. Click a day to filter the timeline to anchors used/created on that day.

| Control | Options |
|---------|---------|
| **Mode** | Usage (anchor use events) or Created (anchor creation dates) |
| **Color** | Blue or Green |
| **Range** | 3 Months, 6 Months, All Time |
| **Clear** | Clears the selected day filter |

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

---

## 11. Data Management

### Export All

Each tab has an **Export All** button in its footer:

- **Anchors tab** → `ca-backup-{timestamp}.json` (all anchors, templates, bundles)
- **Templates tab** → `ca-templates-{timestamp}.json` (all templates)
- **Bundles tab** → `ca-bundles-{timestamp}.json` (all bundles with member anchor data)

### Per-Item Export

Every anchor, template, and bundle card has an **Export** button (⬇️) for single-item export. In bulk mode, use the **Export** button in the bulk bar to export only selected items.

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

> 💡 **Tip:** You don't need to memorize these. Press **?** at any time to see the full reference on your screen.

### Save and manage your notes

| To do this… | Press this | What to expect |
|---|---|---|
| Save text you just copied | **Alt + A** | A short confirmation message appears. |
| Turn bulk mode on or off | **Alt + B** | Checkboxes appear on every item. |
| See your usage history | **Alt + T** | A timeline overlay opens. |

### Open and move around

> 💡 **Shortcuts do not respond while you're typing in a text field.** This prevents them from interfering with your writing. Click a blank area of the page first, then try the shortcut again.

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

> 💡 Click the **lock icon** to keep the list open even when your mouse moves away. Click the **×** button to close it manually.

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

> 💡 **Tip:** If you press Escape and nothing happens, a different dialog may be open underneath. Press Escape again or click outside the dialog.

### Change your shortcuts

You can change four shortcuts to keys that feel more natural to you:
**Alt + A**, **Alt + O**, **Alt + T**, and **Alt + B**.

**Before you start:** Open a new browser tab.

1. Type `chrome://extensions/shortcuts` into your browser's address bar. Press **Enter**.
2. Find **Contextual Anchor** in the list.
3. Click the **pencil icon** (✏️) next to the shortcut you want to change.
4. Press the new key combination you want to use.
5. The change takes effect right away. No restart needed.

> ⚠️ **The Everyday shortcuts (/, ?, Alt + 1–4, Alt + E, and Alt + M) cannot be changed.** They are fixed.

---

## 13. Troubleshooting

> 💡 **Start here:** Two things fix most problems. (1) Make sure you are on **gemini.google.com**. (2) **Reload** the page.

### Quick health check

| Dot color | What it means | What to do |
|---|---|---|
| 🟢 Green | Everything is working. | Nothing needed. |
| 🟡 Yellow | Some features may be limited. | Gemini's layout probably changed slightly — most things still work. |
| 🔴 Red | The extension cannot find the parts of Gemini it needs. | Reload the page. If it stays red, the extension will check for updates automatically. Wait about an hour, then reload again. |

### Common problems

| Problem | Things to check | How to fix |
|---|---|---|
| Your note does not appear in your message | • Is the note turned **on**? (The switch should be green) • Does it have **uses left**? (The number should be more than 0) • Does it have **trigger words**? Your message must include one of them • Is the note **global** or was it saved on the current page? • Did you set a **time limit**? It may have run out • Did the note run out of uses and turn itself off? • Is the correct **bundle** active? Check the Bundles tab • Is it set to the right **mode**? (Prepend, Append, or Intermittent) • Did you type something in your message? (Nothing to insert into) | Open the note's editor to check these settings. Turn the switch on, add uses, adjust trigger words, or check the active bundle in the Bundles tab. |
| The extension icon is missing | • Are you on **gemini.google.com**? (Subdomains like app.gemini.google.com will not work) • Is the extension **enabled** in your browser? | Go to gemini.google.com. Open `chrome://extensions` and check that Contextual Anchor is enabled. Then reload the page. |
| Shortcuts are not responding | • Are you **typing in a text field**? Shortcuts pause while you type. • Is **another extension** using the same key combination? | Click a blank area of the page, then try the shortcut again. To check for conflicts, go to `chrome://extensions/shortcuts`. |
| Slash commands do not work | • Is your cursor inside the Gemini chat box? • Did you type a **space** after **/a** or **/p**? | Click into the chat box. Make sure there is a space after the command. |
| A window will not close | • Have you pressed **Escape** more than once? Escape closes the most recent window first. • Is the **minimap list pinned**? (A blue lock icon means it is pinned open) | Press Escape again to close the next layer. Click the lock icon or the **×** button to unpin the minimap list. |
| Your note stopped appearing even though it has uses left | • Did its **time limit** (TTL) run out? • Did you accidentally **switch bundles**? | Open the note's editor to check the timer. Look at the Bundles tab to see which bundle is active. |

> 💡 **Before you uninstall:** Export your data first. Click the **Export** button at the bottom of the Anchors tab to save everything as a `.json` file. You can import it back if you reinstall.

> 💡 **Still stuck?** Open the browser's developer tools (**F12**), click the **Console** tab, and look for any line starting with `[CA]`. Those lines show what the extension is doing. If you need help, include those lines when you report the issue.