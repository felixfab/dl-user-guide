const fs = require("fs");
let content = fs.readFileSync("index.md", "utf8");

const SCREENSHOT = (name, desc) =>
  `<!-- SCREENSHOT: ${name} — ${desc} (max-width: 780px) -->\n`;

const markers = [
  // 1. Side panel overview — after Tabs icon block, before ## 4. Anchors
  { needle: "> </div>\n\n---\n\n## 4. Anchors", insert: SCREENSHOT("Section 3 — Side Panel", "Full side panel with header controls, tabs, and anchor list") },

  // 2. Turn popup — after "pre-selected next time." line, before ### Managing Anchors
  { needle: "pre-selected next time.\n\n### Managing Anchors", insert: SCREENSHOT("Section 4 — Turn Popup", "Anchor creation popup with Turns, TTL, Description, Source URL fields") },

  // 3. Full editor overlay — after ASCII diagram, before ### Anchor Switcher
  { needle: "└────────────────────────────────────────────────┘\n```\n\n### Anchor Switcher", insert: SCREENSHOT("Section 7 — Editor Overlay", "Full-screen editor with textarea, sidebar (Tags, Keywords, Turns, TTL, etc.), and footer") },

  // 4. Timeline overlay — after Heatmap table, before ### Timeline Cards
  { needle: "selected day filter |\n\n### Timeline Cards", insert: SCREENSHOT("Section 8 — Timeline Overlay", "Timeline heatmap grid with mode/color/range controls and grouped anchor cards") },

  // 5. Slash commands dropdown — after description paragraph, before ## 11. Data Management
  { needle: "your 10 most-used anchors.\n\n---\n\n## 11. Data Management", insert: SCREENSHOT("Section 10 — Slash Commands", "Dropdown appearing in chat input showing matching anchors after typing /a or /p") },

  // 6. Bulk mode — after Bulk Mode table row, before ### Local vs Global
  { needle: "selected anchors to `.json` |\n\n### Local vs Global", insert: SCREENSHOT("Section 4 — Bulk Mode", "Anchor list in bulk mode with checkboxes and bulk action bar (Toggle, +5, Delete, Export)") },

  // 7. Keyboard shortcut overlay — after section heading, before tip
  { needle: "## 12. Keyboard Shortcuts\n\n>", insert: SCREENSHOT("Section 12 — Keyboard Shortcuts", "The built-in ? key shortcut reference overlay") },

  // 8. Bundle badge — after Deactivating Bundles paragraph, before ### Bulk Bundle Operations
  { needle: "The badge then shows the active anchor count.\n\n### Bulk Bundle Operations", insert: SCREENSHOT("Section 6 — Bundle Badge", "Side panel trigger icon showing 2-letter bundle abbreviation badge vs anchor count") },
];

for (const { needle, insert } of markers) {
  // Split needle at first \n\n to find the insertion point
  var idx = needle.indexOf("\n\n");
  if (idx === -1 || !content.includes(needle)) {
    console.log("NOT FOUND:", needle.substring(0, 60) + "...");
    continue;
  }
  var prefix = needle.substring(0, idx + 2); // "...\n\n"
  var suffix = needle.substring(idx + 2);    // rest of needle
  content = content.replace(needle, prefix + insert + suffix);
  console.log("Inserted:", insert.trim().substring(0, 80) + "...");
}

fs.writeFileSync("index.md", content, "utf8");
console.log("\nDone. Total lines:", content.split("\n").length);