/**
 * Screenshot capture script for CA Extension guide.
 * Uses headless Chrome (puppeteer-core) with system Chrome.
 *
 * Approach:
 * 1. Load fixture page with seeded state
 * 2. Load shared.js (creates shadow root at window.__ca.ROOT)
 * 3. Inject anchor.css into shadow root's style element
 * 4. Load all module scripts
 * 5. Trigger desired UI state
 * 6. Capture overlay screenshot via window.__ca.ROOT
 *
 * Key: shared.js creates its own #ca-root in the shadow DOM.
 * window.__ca.ROOT gives access to the shadow root from page context.
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

async function captureOverlay(page, overlayId, outputPath) {
  const info = await page.evaluate(function(id) {
    var shadow = window.__ca.ROOT;
    if (!shadow) return { error: 'no ROOT' };
    var el = shadow.getElementById(id);
    if (!el) return { error: 'no element: ' + id };
    var box = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    return {
      found: true,
      position: cs.position,
      top: cs.top,
      box: { top: box.top, left: box.left, width: box.width, height: box.height }
    };
  }, overlayId);

  if (info.error) {
    log('ERROR capturing', overlayId + ':', info.error);
    return false;
  }

  if (info.position !== 'fixed') {
    log('WARNING: element position is', info.position, '- expected fixed');
  }

  const box = info.box;
  await page.screenshot({
    path: outputPath,
    clip: {
      x: Math.round(box.left),
      y: Math.round(box.top),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height)
    }
  });
  log('Saved:', outputPath, `(${box.width}x${box.height})`);
  return true;
}

async function captureByClass(page, className, outputPath) {
  return page.evaluate(async function(cls) {
    var shadow = window.__ca.ROOT;
    if (!shadow) return null;
    var el = shadow.querySelector('.' + cls);
    if (!el) return null;
    var box = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    return {
      x: Math.round(box.left),
      y: Math.round(box.top),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height),
      position: cs.position
    };
  }, className).then(function(clip) {
    if (!clip) {
      log('ERROR: no element with class:', className);
      return false;
    }
    return page.screenshot({ path: outputPath, clip: clip }).then(function() {
      log('Saved:', outputPath, `(${clip.width}x${clip.height})`);
      return true;
    });
  });
}

async function captureMinimap(page, outputPath) {
  return page.evaluate(async function() {
    var shadow = window.__ca.ROOT;
    var minimap = shadow.querySelector('.ca-minimap');
    if (!minimap) return null;
    var box = minimap.getBoundingClientRect();
    var cs = window.getComputedStyle(minimap);
    if (cs.display === 'none' || cs.visibility === 'hidden' || minimap.classList.contains('hidden')) return null;
    return {
      x: Math.round(box.left),
      y: Math.round(box.top),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height)
    };
  }).then(function(clip) {
    if (!clip) return false;
    return page.screenshot({ path: outputPath, clip: clip }).then(function() {
      log('Saved:', outputPath, `(${clip.width}x${clip.height})`);
      return true;
    });
  });
}

async function initPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('pageerror', err => {
    if (!err.message.includes('addListener')) {
      log('PAGE ERROR:', err.message);
    }
  });

  await page.goto('file://' + FIXTURE, { waitUntil: 'domcontentloaded' });
  await sleep(200);

  await page.addScriptTag({ path: path.join(SRC, 'shared.js') });
  await sleep(500);

  const cssContent = fs.readFileSync(CSS, 'utf8');
  await page.evaluate(function(css) {
    const shadow = window.__ca.ROOT;
    if (!shadow) return;
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

const MOCK_ANCHORS = [
  { id: 'anchor_aaaa1111', text: 'The most reliable modern approach is flexbox: .parent { display: flex; justify-content: center; align-items: center; }', turnsRemaining: 7, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 3600000, tags: ['css', 'layout'], triggerKeywords: ['flexbox', 'center'], description: 'Flexbox centering pattern', originalTurns: 10, order: 1 },
  { id: 'anchor_bbbb2222', text: 'Grid is excellent for two-dimensional layouts: .parent { display: grid; place-items: center; }', turnsRemaining: 5, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 1800000, tags: ['css', 'layout'], triggerKeywords: ['grid', 'two-dimensional'], description: 'CSS Grid centering', originalTurns: 10, order: 2 },
  { id: 'anchor_cccc3333', text: 'Absolute positioning fallback for old browsers: .child { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }', turnsRemaining: 3, turnsTotal: 10, toggle: true, active: true, isGlobal: false, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 900000, tags: ['css', 'legacy'], triggerKeywords: ['old browsers', 'position'], description: 'Absolute centering fallback', originalTurns: 10, order: 3 },
  { id: 'anchor_dddd4444', text: 'Flexbox and grid are the recommended approaches for 2024.', turnsRemaining: 10, turnsTotal: 10, toggle: false, active: true, isGlobal: true, sourceUrl: 'https://gemini.google.com/chat/test1', createdAt: Date.now() - 7200000, tags: ['css'], triggerKeywords: [], description: 'Summary recommendation', originalTurns: 10, order: 4 }
];

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  log('=== Dashboard (populated) ===');
  {
    const page = await initPage(browser);
    await loadModules(page);

    // Seed state.anchors and analytics.turns for dashboard data
    await page.evaluate(function(anchors) {
      window.__ca.state.anchors = anchors;
      window.__ca.state.analytics = {
        sessionId: 'test-session-001',
        prompts: 3,
        turns: [
          { turn: 1, inputTokens: 120, outputTokens: 340, promptText: 'What is the best way to center a div in CSS?', responseText: 'The most reliable modern approach is flexbox...', activeAnchors: ['anchor_aaaa1111'] },
          { turn: 2, inputTokens: 280, outputTokens: 520, promptText: 'What about grid?', responseText: 'Grid is excellent for two-dimensional layouts...', activeAnchors: ['anchor_bbbb2222'] },
          { turn: 3, inputTokens: 410, outputTokens: 680, promptText: 'Any old browser support?', responseText: 'For very old browsers, you can use absolute positioning...', activeAnchors: ['anchor_cccc3333'] }
        ]
      };
    }, MOCK_ANCHORS);

    await page.evaluate(function() { window.__ca.dashboard.toggle(); });
    await sleep(1000);
    await captureOverlay(page, 'ca-dashboard-overlay',
      path.join(OUT, 'section-13-dashboard-populated.png'));
    await page.close();
  }

  log('=== Dashboard (empty) ===');
  {
    const page = await initPage(browser);
    await loadModules(page);

    await page.evaluate(function() { window.__ca.dashboard.toggle(); });
    await sleep(1000);
    await captureOverlay(page, 'ca-dashboard-overlay',
      path.join(OUT, 'section-13-dashboard-empty.png'));
    await page.close();
  }

  log('=== Minimap anchor list (grouped modal) ===');
  {
    const page = await initPage(browser);
    await loadModules(page);

    // Set state.anchors so minimap shows colored bars with anchor highlights
    await page.evaluate(function(anchors) {
      window.__ca.state.anchors = anchors;
      window.__ca.minimap.init();
      window.__ca.minimap.toggle();
      window.__ca.minimap.update();
    }, MOCK_ANCHORS);
    await sleep(500);

    // Click the toggle-grouped-modal button to show anchor list popup
    await page.evaluate(function() {
      var container = window.__ca.minimap._test.container();
      var toggleBtn = container.querySelector('[data-action="toggle-grouped-modal"]');
      if (toggleBtn) toggleBtn.click();
    });
    await sleep(1000);

    await captureByClass(page, 'ca-cmd-dropdown',
      path.join(OUT, 'section-12-minimap-anchor-list.png'));
    await page.close();
  }

  await browser.close();
  log('Done! All screenshots saved to', OUT);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});