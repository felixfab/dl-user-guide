const fs = require("fs");
const content = fs.readFileSync("index.md", "utf8");

const SCREENSHOT = (name, desc) =>
  `<!-- SCREENSHOT: ${name} — ${desc} (max-width: 780px) -->`;

const markers = [
  // 1. Side panel overview — after Header Controls table, before ### Tabs
  { after: "> </div>\n\n### Tabs", insert: SCREENSHOT("Section 3 — Side Panel", "Full side panel with header controls, tabs, and anchor list") + "\n" },

  // 2. Turn popup — after The Turn Popup table, before ### Managing Anchors
  { after: "pre-selected next time.\n\n### Managing Anchors", insert: SCREENSHOT("Section 4 — Turn Popup", "Anchor creation popup with Turns, TTL, Description, Source URL fields") + "\n" },

  // 3. Full editor overlay — after the ASCII diagram, before ### Anchor Switcher
  { after: "└────────────────────────────────────────────────┘\n```\n\n### Anchor Switcher", insert: SCREENSHOT("Section 7 — Editor Overlay", "Full-screen editor with textarea, sidebar (Tags, Keywords, Turns, TTL, etc.), and footer") + "\n" },

  // 4. Timeline overlay — after Heatmap table, before ### Timeline Cards
  { after: "selected day filter |\n\n### Timeline Cards", insert: SCREENSHOT("Section 8 — Timeline Overlay", "Timeline heatmap grid with mode/color/range controls and grouped anchor cards") + "\n" },

  // 5. Slash commands dropdown — after the command table, before ## 11. Data Management
  { after: "your 10 most-used anchors.\n\n---\n\n## 11. Data Management", insert: SCREENSHOT("Section 10 — Slash Commands", "Dropdown appearing in chat input showing matching anchors after typing /a or /p") + "\n" },

  // 6. Bulk mode — after Bulk Mode table
  { after: "selected anchors to `.json` |\n\n### Local vs Global", insert: SCREENSHOT("Section 4 — Bulk Mode", "Anchor list in bulk mode with checkboxes and bulk action bar (Toggle, +5, Delete, Export)") + "\n" },

  // 7. Keyboard shortcut overlay — first line of Section 12
  { after: "## 12. Keyboard Shortcuts\n\n>", insert: SCREENSHOT("Section 12 — Keyboard Shortcuts", "The built-in ? key shortcut reference overlay") + "\n" },

  // 8. Bundle badge — after Bundle Badge paragraph
  { after: "active anchor count.\n\n### Deactivating Bundles", insert: SCREENSHOT("Section 6 — Bundle Badge", "Side panel trigger icon showing 2-letter bundle abbreviation badge vs anchor count") + "\n" },
];

for (const { after, insert } of markers) {
  if (content.includes(after)) {
    content = content.replace(after, insert + after);
    console.log("Inserted:", insert.trim().substring(0, 80) + "...");
  } else {
    console.log("NOT FOUND:", after.substring(0, 60) + "...");
  }
}

fs.writeFileSync("index.md", content, "utf8");
console.log("\nDone. Total lines:", content.split("\n").length);