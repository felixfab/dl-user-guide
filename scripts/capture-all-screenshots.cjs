/**
 * Comprehensive screenshot capture for all remaining overlay UIs.
 * Uses headless Chrome (puppeteer-core) with system Chrome.
 *
 * Screenshot targets:
 * 1. section-3-side-panel.png     - Full side panel (panel with .open class)
 * 2. section-4-turn-popup.png      - Turn popup (anchor creation dialog)
 * 3. section-4-bulk-mode.png       - Bulk mode (panel with checkboxes)
 * 4. section-6-bundle-badge.png    - Bundle badge (trigger zone icon)
 * 5. section-8-editor-overlay.png - Editor overlay (full-screen)
 * 6. section-8-timeline-overlay.png - Timeline overlay
 * 7. section-10-slash-commands.png - Slash commands dropdown
 * 8. section-12-keyboard-shortcuts.png - N/A (? opens external guide)
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'screenshot-mock.html');
const SRC = path.join(__dirname, '..', 'src', 'anchor');
const CSS = path.join(__dirname, '..', 'src', 'anchor', 'anchor.css');
const OUT = '/tmp/ca-screenshots';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(...args) {
  console.log(`[${new Date().toISOString().split('T')[1].slice(0, -1)}]`, ...args);
}

const MOCK_ANCHORS = [
  { id: 'anchor_aaaa1111', text: 'The most reliable modern approach is flexbox: .parent { display: flex; justify-content: center; align-items: center; }', turnsRemaining: 7, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 3600000, tags: ['css', 'layout'], triggerKeywords: ['flexbox', 'center'], description: 'Flexbox centering pattern', originalTurns: 10, order: 1 },
  { id: 'anchor_bbbb2222', text: 'Grid is excellent for two-dimensional layouts: .parent { display: grid; place-items: center; }', turnsRemaining: 5, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 1800000, tags: ['css', 'layout'], triggerKeywords: ['grid', 'two-dimensional'], description: 'CSS Grid centering', originalTurns: 10, order: 2 },
  { id: 'anchor_cccc3333', text: 'Absolute positioning fallback for old browsers: .child { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }', turnsRemaining: 3, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 900000, tags: ['css', 'legacy'], triggerKeywords: ['old browsers', 'position'], description: 'Absolute centering fallback', originalTurns: 10, order: 3 },
  { id: 'anchor_dddd4444', text: 'Flexbox and grid are the recommended approaches for 2024.', turnsRemaining: 10, turnsTotal: 10, toggle: false, active: true, isGlobal: true, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 7200000, tags: ['css'], triggerKeywords: [], description: 'Summary recommendation', originalTurns: 10, order: 4 }
];

async function initPage(browser, options = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: options.scale || 1 });

  page.on('pageerror', err => {
    if (!err.message.includes('addListener')) log('PAGE ERROR:', err.message);
  });

  await page.goto('file://' + FIXTURE, { waitUntil: 'domcontentloaded' });
  await sleep(200);
  await page.addScriptTag({ path: path.join(SRC, 'shared.js') });
  await sleep(500);

  const cssContent = fs.readFileSync(CSS, 'utf8');
  await page.evaluate(function(css) {
    const shadow = window.__ca.ROOT;
    const style = shadow.querySelector('style');
    if (style) style.textContent = css;
  }, cssContent);

  return page;
}

async function loadModules(page) {
  const mods = [
    'storage.js', 'host-adapter.js',
    'minimap-math.js', 'timeline-math.js',
    'content-math.js', 'panel-math.js', 'simulator-math.js',
    'panel.js', 'timeline.js', 'simulator.js', 'minimap.js',
    'dashboard-math.js', 'dashboard.js', 'content.js'
  ];
  for (const mod of mods) {
    const fp = path.join(SRC, mod);
    if (fs.existsSync(fp)) await page.addScriptTag({ path: fp });
  }
  await sleep(1500);
}

async function seedState(page) {
  await page.evaluate(function(anchors) {
    window.__ca.state.anchors = anchors;
    window.__ca.state.analytics = {
      sessionId: 'test-session-001',
      prompts: 3,
      turns: [
        { turn: 1, inputTokens: 120, outputTokens: 340, promptText: 'What is the best way to center a div in CSS?', responseText: 'The most reliable modern approach is flexbox...', activeAnchors: ['anchor_aaaa1111'] },
        { turn: 2, inputTokens: 280, outputTokens: 520, promptText: 'What about grid?', responseText: 'Grid is excellent for two-dimensional layouts...', activeAnchors: ['anchor_bbbb2222'] },
        { turn: 3, inputTokens: 410, outputTokens: 680, promptText: 'Any old browser support?', responseText: 'For very old browsers...', activeAnchors: ['anchor_cccc3333'] }
      ]
    };
  }, MOCK_ANCHORS);
}

async function captureShadow(page, selector, outputPath, options = {}) {
  const info = await page.evaluate(function(sel) {
    const shadow = window.__ca.ROOT;
    const el = shadow.querySelector(sel);
    if (!el) return { error: 'not found: ' + sel };
    const box = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    return {
      found: true,
      box: { top: box.top, left: box.left, width: box.width, height: box.height },
      position: cs.position,
      display: cs.display,
      visibility: cs.visibility
    };
  }, selector);

  if (info.error) {
    log('ERROR:', info.error);
    return false;
  }

  const clip = { x: Math.round(info.box.left), y: Math.round(info.box.top), width: Math.ceil(info.box.width), height: Math.ceil(info.box.height) };

  if (options.padding) {
    clip.x -= options.padding;
    clip.y -= options.padding;
    clip.width += options.padding * 2;
    clip.height += options.padding * 2;
  }

  if (options.minWidth && clip.width < options.minWidth) clip.width = options.minWidth;
  if (options.minHeight && clip.height < options.minHeight) clip.height = options.minHeight;

  await page.screenshot({ path: outputPath, clip });
  log('Saved:', path.basename(outputPath), `(${clip.width}x${clip.height})`, '←', selector);
  return true;
}

async function openPanel(page) {
  await page.evaluate(function() {
    window.__ca.state.panelOpen = true;
    const panel = window.__ca.shared.$id('ca-panel');
    if (panel) panel.classList.add('open');
  });
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  log('=== 1. Side Panel ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await openPanel(page);
    await sleep(500);
    // Panel at left=1123, width=317, height=700 (reduced from 900)
    await page.screenshot({ path: path.join(OUT, 'section-3-side-panel.png'), clip: { x: 1123, y: 0, width: 317, height: 700 } });
    log('Saved: section-3-side-panel.png (317x700)');
    await page.close();
  }

  log('=== 2. Turn Popup ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await openPanel(page);
    await sleep(500);
    // Trigger turn popup (Alt+A)
    await page.evaluate(function() {
      window.__ca.panel.renderTurnPopup({ turnIndex: 3 });
    });
    await sleep(500);
    await captureShadow(page, '#ca-turn-popup', path.join(OUT, 'section-4-turn-popup.png'), { minWidth: 400, minHeight: 300 });
    await page.close();
  }

  log('=== 3. Bulk Mode ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await openPanel(page);
    await sleep(500);
    await page.evaluate(function() { window.__ca.panel.toggleBulk(); });
    await sleep(500);
    // Capture the panel in bulk mode (height reduced to 700)
    await page.screenshot({ path: path.join(OUT, 'section-4-bulk-mode.png'), clip: { x: 1123, y: 0, width: 317, height: 700 } });
    log('Saved: section-4-bulk-mode.png (317x700)');
    await page.close();
  }

  log('=== 4. Bundle Badge (trigger zone) ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await sleep(500);
    // Capture the trigger zone which shows the bundle badge (2x scale for clarity)
    await captureShadow(page, '.ca-trigger-zone', path.join(OUT, 'section-6-bundle-badge.png'), { minWidth: 100, minHeight: 100, padding: 20 });
    await page.close();
  }

  log('=== 5. Editor Overlay ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await sleep(500);
    await page.evaluate(function() {
      const anchor = window.__ca.storage.getAll()[0];
      window.__ca.panel.renderEditorOverlay('anchor', anchor);
    });
    await sleep(1000);
    await captureShadow(page, '#ca-editor-overlay', path.join(OUT, 'section-8-editor-overlay.png'), { minWidth: 400, minHeight: 300 });
    await page.close();
  }

  log('=== 6. Timeline Overlay ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await sleep(500);
    await page.evaluate(function() {
      if (window.__ca.timeline && window.__ca.timeline.renderTimelineOverlay) window.__ca.timeline.renderTimelineOverlay();
    });
    await sleep(1000);
    await captureShadow(page, '#ca-timeline-overlay', path.join(OUT, 'section-8-timeline-overlay.png'), { minWidth: 400, minHeight: 300 });
    await page.close();
  }

  log('=== 7. Slash Commands ===');
  {
    const page = await initPage(browser);
    await loadModules(page);
    await seedState(page);
    await sleep(500);
    await page.evaluate(function() {
      const input = document.querySelector('[role="textbox"][contenteditable="true"]');
      if (!input) return;
      input.textContent = '/a ';
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    });
    await sleep(300);
    await captureShadow(page, '#ca-cmd-dropdown', path.join(OUT, 'section-10-slash-commands.png'), { minWidth: 300, minHeight: 200 });
    await page.close();
  }

  log('=== 8. Keyboard Shortcuts ===');
  {
    // ? opens external guide - capture a placeholder or skip
    // For now, skip since it can't be captured from extension
    log('SKIPPED: ? opens external guide at felixfab.github.io/dl-user-guide/');
  }

  await browser.close();
  log('\nDone! All screenshots saved to', OUT);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});