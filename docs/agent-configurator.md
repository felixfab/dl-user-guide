# Agent Configurator - User Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Dashboard Overview](#dashboard-overview)
3. [Tag System](#tag-system)
4. [Agent Editor](#agent-editor)
5. [Timeline Overlay](#timeline-overlay)
6. [Settings](#settings)
7. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Quick Start

### Initial Setup

1. **Create your workspace** - Set up API keys in Settings before proceeding
2. **Load a timeline file** - Click the timeline overlay to browse and select a `.ca` or `.json` file
3. **Start configuring** - Use the tag system to build your agent configuration

### Basic Workflow

```
Load File → Review Tags → Configure Agents → Set Triggers → Validate → Save
```

---

## Dashboard Overview

### Main Panel Layout

The dashboard displays multiple synchronized charts:

- **Agent Distribution Chart** - Shows count of agents per type
- **Turn Usage Chart** - Bar chart of turn frequency across agents  
- **Tag Frequency Chart** - Word cloud showing tag popularity
- **Interaction Heatmap** - Visualizes agent interactions

### Filter Controls

Top toolbar provides global filters:

- **Date Range** - Select start/end dates or preset ranges (7d, 30d, All)
- **Agent Type** - Multi-select filter for specific agent categories
- **Tag Search** - Type to filter by tag name/pattern
- **View Toggle** - Switch between Grid and List view formats

**Tip:** Filters persist across sessions. Clear all filters via the reset button (⊘).

---

## Tag System

### Adding Tags

**Method 1: Typing Input**
```markdown
Type in the main text area, press Enter to create a tag, then edit by clicking the tag.
Press [Esc] to remove the last added tag.
```

**Method 2: Suggestion Dropdown**
```
Click the tag input field to see suggestions. Click or press Arrow Keys + Enter to select.
Suggestion counts appear in parentheses - higher numbers indicate more common tags.
```

### Managing Tags

Each tag displays with optional metadata badges:

- **Count Badge** - Number of occurrences (click to toggle visibility)
- **Rename Button** - Edit tag name by clicking the pencil (✎) icon
- **Toggle Visibility** - Click stat chips to show/hide them on charts

**Renaming a Tag:**
```
1. Click the ✎ button on the tag
2. Enter new name in the inline input
3. Press [Enter] or click away to confirm
4. The change updates across all instances and charts
```

### Tag Suggestions

The dropdown appears when you:
- Click in the tag input box
- Type characters (auto-filters suggestions)
- Tab through available options

To clear suggestions, press `[Esc]` or focus elsewhere.

---

## Agent Editor

### Configuration Fields

Every agent configuration contains these editable sections:

#### Turns Display
```
[50 turns remaining] [▓▓▓▓░░░░ 75%]
```
- Shows current turn count and progress gradient bar
- Decrements as you configure steps in the workflow
- Reset via Settings → Clear Turn Count

#### Agent Selection Buttons
- **Status** - Select agent operational state (Active/Inactive)
- **Scope** - Define agent scope (Global/Local/System)

#### Toggle Row
Toggle additional configuration options:
- Advanced settings visibility
- Validation rules
- Auto-save preferences

---

## Timeline Overlay

### Opening the Overlay

Click anywhere on the main timeline to trigger the full-screen overlay. The overlay provides access to all configuration actions.

### Panel Controls

```
┌─────────────────────────────────────┐
│ [Agent Name]           [Timeline...] │  ← Header with title and dots menu
├─────────────────────────────────────┤
│                                     │
│       Configuration Content Area    │
│        (scrollable if needed)       │
│                                     │
├─────────────────────────────────────┤
│  [Cancel]      [Save Changes]       │  ← Footer with action buttons
└─────────────────────────────────────┘
```

### Actions Available in Overlay

- **Edit Agent** - Modify agent properties directly
- **Add New Agent** - Click "Add Agent" button in toolbar
- **Bulk Operations** - Select multiple agents, apply uniform changes
- **Import/Export** - Upload configuration files or download current state

---

## Settings

### Accessing Settings

Click the gear icon (⚙️) in the top-right corner of the application header, then select "Settings" from the dropdown menu.

### Settings Sections

#### General Tab
```
- App Name:        Editable app title or leave blank for default
- Theme Toggle:    ☀ / 🌙   Switch between Light and Dark themes
- Language:        Dropdown with available locales (EN, ES, FR, DE, etc.)
- Auto-save:       ✓/✗ Checkbox to enable automatic saves every 30s
```

#### Agents Tab  
```
- Default Agent:   Select which agents appear first
- Show Stats:      Toggle visibility of agent statistics
- Editor Mode:     Dropdown (Simple/Advanced/Expert)
```

#### Appearance Tab
```
- Font Size:       Small | Medium * | Large
- Chart Density:   Compact * | Spacious  
- Border Radius:   Rounded * | Sharp
```

#### Advanced Tab
```
- API Keys:        Manage authentication tokens (see Security section)
- Webhook URL:     Configure outbound webhook destinations  
- Export Paths:    Set default download directory preferences
```

### Saving Settings

Settings are stored immediately upon changes. To confirm and persist across sessions, click "Apply" in the bottom-right footer.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search bar |
| `?` | Open shortcuts help |
| `Cmd/Ctrl+S` | Save configuration |
| `Cmd/Ctrl+Z` | Undo last change |
| `Cmd/Ctrl+Y` | Redo previous action |
| `Cmd/Ctrl+A` | Select all elements |
| `Cmd/Ctrl+F` | Find in timeline |
| `[ ]` Arrow keys | Navigate between tags |
| `-` | Remove current tag |
| `Del/Backspace` | Delete selected item |
| `Esc` | Close overlay/dropdowns/cancel input |

---

## Support & Resources

### Documentation Links
- [API Reference](AGENTS.md#api-reference)
- [Component Library](AGENTS.md#component-library)  
- [State Management Guide](AGENTS.md#state-management)

### Reporting Issues

If you encounter bugs, please report to: `/tmp/opencode/issues` or file a GitHub issue at the project repository.

### Tips for Power Users

1. **Use tags efficiently** - Type common tag names to create reusable templates
2. **Leverage suggestions** - Watch for suggested tags with high counts for validated patterns  
3. **Batch configure agents** - Select multiple in overlay and apply uniform settings
4. **Set up webhooks** - Configure export paths in Advanced settings to save work automatically

---

*Version 1.0 • Last Updated: May 2026*