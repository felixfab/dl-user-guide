(function() {
  'use strict';

  var searchDebounceTimer = null;
  var templateSearchTimer = null;
  var bundleSearchTimer = null;
  var constraintSearchTimer = null;
  var currentFilter = 'all';
  var currentTemplateFilter = 'all';
  var currentBundleFilter = 'all';
  var currentSearch = '';
  var currentTemplateSearch = '';
  var currentBundleSearch = '';
  var currentConstraintSearch = '';
  var currentTab = 'anchors';
  var currentSort = 'newest';
  var currentPanelGroup = 'none';
  var collapsedPanelGroups = window.__ca.state.collapsedGroups = window.__ca.state.collapsedGroups || {};
  var currentTemplateSort = 'newest';
  var currentTemplateGroup = 'none';
  var collapsedTemplateGroups = {};
  var currentBundleSort = 'newest';
  var currentConstraintSort = 'newest';
  var currentConstraintFilter = 'all';
  var lastBadgeValue = '';

  // Placeholder: feature gating for paid tier features.
  window.__ca.license = window.__ca.license || { isFeatureEnabled: function() { return false; } };
  // Unified bulk state — shared with timeline.js via window.__ca.state.bulk
  function _bulkState() { return window.__ca.state && window.__ca.state.bulk ? window.__ca.state.bulk : { enabled: false, selectedIds: [], entityType: 'anchor' }; }
  var panelLocked = false;
  var editorEscapeHandler = null;
  var lastPopupTurns = 10;
  var lastPopupTTL = null;

  function init() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(init, 100);
      return;
    }
    window.__ca.events.on('anchors:changed', function() {
      if (currentTab === 'anchors') updateAnchorList();
      if (currentTab === 'templates') updateTemplateList();
      if (currentTab === 'bundles') updateBundleList();
      updateBadge();
    });
    window.__ca.events.on('constraints:changed', function() {
      if (currentTab === 'constraints') updateConstraintList();
      updateConstraintBadge();
    });
    window.__ca.events.on('health:changed', function(state) {
      updateHealthDot(state);
    });
  }

  function updateHealthDot(state) {
    var dot = window.__ca.shared.$id('ca-health-dot');
    if (!dot) return;
    dot.className = 'ca-health-dot ' + state;
    if (window.__ca.state && window.__ca.state.healthReason && window.__ca.state.healthReason.indexOf('selector') === 0) {
      dot.title = 'Gemini UI structure changed — some features disabled. Check for extension update.';
    } else if (state === 'degraded') {
      dot.title = 'Some features unavailable';
    } else if (state === 'offline') {
      dot.title = 'Gemini interface changed — update in progress';
    } else {
      dot.title = 'All systems connected';
    }
  }

  function showBulkToast(message) {
    var t = window.__ca.shared.$id('ca-toast');
    if (!t) return;
    t.textContent = message;
    t.className = 'ca-toast visible success';
    // Remove any existing undo button
    var existingUndo = t.querySelector('[data-action="undo-bulk"]');
    if (existingUndo) existingUndo.remove();
    setTimeout(function() {
      t.className = 'ca-toast';
      var oldUndo = t.querySelector('[data-action="undo-bulk"]');
      if (oldUndo) oldUndo.remove();
    }, 4000);
  }

  function showUndoableBulkToast(message, undoCallback) {
    var t = window.__ca.shared.$id('ca-toast');
    if (!t) return;
    if (t._undoHandler) {
      t.removeEventListener('click', t._undoHandler);
      t._undoHandler = null;
    }
    if (t._undoTimer) {
      clearTimeout(t._undoTimer);
      t._undoTimer = null;
    }
    t.textContent = '';
    t.className = 'ca-toast visible success';

    var msgSpan = window.__ca.shared.$create('span', { textContent: message });
    t.appendChild(msgSpan);

    var undoBtn = window.__ca.shared.$create('button', {
      className: 'ca-toast-undo-btn',
      'data-action': 'undo-bulk',
      textContent: 'Undo'
    });
    t.appendChild(undoBtn);

    var undoHandler = function(e) {
      var target = e.target.closest('[data-action="undo-bulk"]');
      if (!target) return;
      if (undoCallback) undoCallback();
      t.className = 'ca-toast';
      t.textContent = '';
      t.removeEventListener('click', undoHandler);
      t._undoHandler = null;
    };
    t.addEventListener('click', undoHandler);
    t._undoHandler = undoHandler;

    t._undoTimer = setTimeout(function() {
      t.className = 'ca-toast';
      t.textContent = '';
      t.removeEventListener('click', undoHandler);
      t._undoHandler = null;
      t._undoTimer = null;
    }, 5000);
  }

  function getRelativeTime(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }

  var ICON_COLLAPSE, ICON_EXPAND, ICON_EXPORT, ICON_IMPORT, ICON_TOGGLE, ICON_ADD, ICON_CLOSE, ICON_TIMELINE, ICON_LOCK, ICON_BULK, ICON_ANCHOR, ICON_TEMPLATE, ICON_BUNDLE, ICON_FILTER, ICON_CLEAR, ICON_DEACTIVATE, ICON_PROFILE, ICON_COPY, ICON_INJECT, ICON_EDIT, ICON_DELETE, ICON_INJECT_ALL, ICON_PIN, ICON_TTL, ICON_GLOBE;

  function renderPanel() {
    var $create = window.__ca.shared.$create;
    var $icon = window.__ca.shared.$icon;
    var escAttr = window.__ca.shared.escAttr;
    var theme = window.__ca.shared.detectTheme();
    ICON_COLLAPSE = $icon('0 0 24 24', [
      { tag: 'polyline', attrs: { points: '15 18 9 12 15 6' } }
    ]);
    ICON_EXPAND = $icon('0 0 24 24', [
      { tag: 'polyline', attrs: { points: '15 18 9 12 15 6' } }
    ]);

ICON_EXPORT = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
  { tag: 'line', attrs: { x1: '12', y1: '15', x2: '12', y2: '3' } }
]);
ICON_IMPORT = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' } },
  { tag: 'polyline', attrs: { points: '7 10 12 5 17 10' } },
  { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '15' } }
]);
ICON_TOGGLE = $icon('0 0 24 24', [
  { tag: 'rect', attrs: { x: '1', y: '5', width: '22', height: '14', rx: '7' } },
  { tag: 'circle', attrs: { cx: '8', cy: '12', r: '4' } }
]);
ICON_ADD = $icon('0 0 24 24', [
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'line', attrs: { x1: '12', y1: '8', x2: '12', y2: '16' } },
  { tag: 'line', attrs: { x1: '8', y1: '12', x2: '16', y2: '12' } }
]);
ICON_CLOSE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M18 6L6 18M6 6l12 12' } }
]);
ICON_TIMELINE = $icon('0 0 24 24', [
  { tag: 'rect', attrs: { x: '3', y: '3', width: '7', height: '7', rx: '1' } },
  { tag: 'rect', attrs: { x: '14', y: '3', width: '7', height: '7', rx: '1' } },
  { tag: 'rect', attrs: { x: '3', y: '14', width: '7', height: '7', rx: '1' } },
  { tag: 'rect', attrs: { x: '14', y: '14', width: '7', height: '7', rx: '1' } }
]);
ICON_LOCK = $icon('0 0 24 24', [
  { tag: 'rect', attrs: { x: '3', y: '11', width: '18', height: '11', rx: '2' } },
  { tag: 'path', attrs: { d: 'M7 11V7a5 5 0 0110 0v4' } }
]);
ICON_BULK = $icon('0 0 24 24', [
  { tag: 'rect', attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2' } },
  { tag: 'path', attrs: { d: 'M9 12l2 2 4-4' } }
]);
ICON_ANCHOR = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z' } }
]);
ICON_TEMPLATE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' } },
  { tag: 'polyline', attrs: { points: '14 2 14 8 20 8' } },
  { tag: 'line', attrs: { x1: '16', y1: '13', x2: '8', y2: '13' } },
  { tag: 'line', attrs: { x1: '16', y1: '17', x2: '8', y2: '17' } }
]);
ICON_BUNDLE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' } }
]);
ICON_FILTER = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' } }
]);
ICON_CLEAR = $icon('0 0 24 24', [
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'polyline', attrs: { points: '12 6 12 12 16 14' } }
]);
ICON_DEACTIVATE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M18.36 6.64a9 9 0 1 1-12.73 0' } },
  { tag: 'line', attrs: { x1: '12', y1: '2', x2: '12', y2: '12' } }
]);
ICON_PROFILE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2' } },
  { tag: 'circle', attrs: { cx: '12', cy: '7', r: '4' } }
]);
ICON_COPY = $icon('0 0 24 24', [
  { tag: 'rect', attrs: { x: '9', y: '9', width: '13', height: '13', rx: '2' } },
  { tag: 'path', attrs: { d: 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1' } }
]);
ICON_INJECT = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M5 12h13M12 5l7 7-7 7' } }
]);
ICON_EDIT = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7' } },
  { tag: 'path', attrs: { d: 'M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z' } }
]);
ICON_DELETE = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2' } }
]);
ICON_INJECT_ALL = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M5 12h13M12 5l7 7-7 7' } },
  { tag: 'path', attrs: { d: 'M2 9l3-3M2 15l3 3' } }
]);
ICON_PIN = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M12 2L15 9l7 1-5 5.5L18 22l-6-3.5L6 22l1-6.5L2 10l7-1z' } }
]);
ICON_TTL = $icon('0 0 24 24', [
  { tag: 'path', attrs: { d: 'M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6' } }
]);
ICON_GLOBE = $icon('0 0 24 24', [
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
  { tag: 'line', attrs: { x1: '2', y1: '12', x2: '22', y2: '12' } },
  { tag: 'path', attrs: { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' } }
]);

        function btn(cls, action, title, aria, icon) {
      var b = $create('button', { className: cls, 'data-action': action });
      if (title) b.setAttribute('title', title);
      if (aria) b.setAttribute('aria-label', aria);
      if (icon) b.appendChild(icon.cloneNode(true));
      return b;
    }
    function opt(value, text) {
      return $create('option', { value: value, textContent: text });
    }
    function tabContent(id, active, buildFn) {
      var tc = $create('div', { id: id, className: 'ca-tab-content' + (active ? ' active' : '') });
      buildFn(tc);
      return tc;
    }
    function bulkBar(id, buttons) {
      var bar = $create('div', { id: id, className: 'ca-bulk-bar hidden' });
      bar.appendChild($create('span', { className: 'ca-bulk-count', textContent: '0 selected' }));
      for (var bi = 0; bi < buttons.length; bi++) {
        var bd = buttons[bi];
        if (bd === '|') { bar.appendChild($create('span', { className: 'ca-bulk-separator' })); continue; }
        bar.appendChild($create('button', { className: 'ca-btn-bulk-action' + (bd.cls || ''), 'data-action': bd.action, textContent: bd.label }));
      }
      return bar;
    }

    var panel = $create('div', { id: 'ca-panel', className: 'ca-panel' });
    panel.setAttribute('theme', escAttr(theme));

    var header = $create('div', { className: 'ca-panel-header' });
    var modeBtn = $create('button', { className: 'ca-btn-mode-toggle', 'data-action': 'toggle-panel-mode', 'aria-label': 'Switch to minimal' });
    modeBtn.appendChild(ICON_COLLAPSE.cloneNode(true));
    header.appendChild(modeBtn);
    var headerActions = $create('div', { className: 'ca-header-actions' });
    headerActions.appendChild($create('span', { id: 'ca-health-dot', className: 'ca-health-dot offscreen', title: 'Checking...' }));
    headerActions.appendChild(btn('ca-btn-icon ca-btn-timeline', 'open-timeline', null, 'Open timeline', ICON_TIMELINE));
    var pgBtn = $create('button', { className: 'ca-btn-icon ca-btn-playground', 'data-action': 'open-playground', 'aria-label': 'Open Playground', title: 'Open Playground' });
    pgBtn.appendChild($create('span', { textContent: '\u26A1' }));
    headerActions.appendChild(pgBtn);
    headerActions.appendChild(btn('ca-btn-icon ca-btn-lock', 'toggle-lock', null, 'Lock panel', ICON_LOCK));
    headerActions.appendChild(btn('ca-btn-icon ca-btn-bulk', 'toggle-bulk', null, 'Bulk select', ICON_BULK));
    var shBtn = $create('button', { className: 'ca-btn-icon ca-btn-shortcuts', 'data-action': 'open-help-guide', 'aria-label': 'Help guide', title: 'Open help guide (opens new tab)' });
    shBtn.appendChild($create('span', { textContent: '?' }));
    shBtn.firstChild.style.cssText = 'font-size:16px;font-weight:600;line-height:1';
    headerActions.appendChild(shBtn);
    headerActions.appendChild(btn('ca-panel-close', 'close-panel', null, 'Close panel', ICON_CLOSE));
    header.appendChild(headerActions);
    panel.appendChild(header);

    /* Minimal header — wraps status bar + lock/gear, blurred in minimal mode */
    var minimalHeader = $create('div', { className: 'ca-minimal-header' });
    var statusBar = $create('div', { className: 'ca-panel-status' });
    var statusProfile = $create('span', { className: 'ca-status-profile', 'data-action': 'open-behavior-editor' });
    statusProfile.appendChild(ICON_PROFILE.cloneNode(true));
    var statusProfileName = $create('span', { className: 'ca-status-profile-name dimmed', textContent: 'No profile' });
    statusProfile.appendChild(statusProfileName);
    statusBar.appendChild(statusProfile);
    var statusSep = $create('span', { className: 'ca-status-sep', textContent: '\u00B7' });
    statusBar.appendChild(statusSep);
    var statusConstraints = $create('span', { className: 'ca-status-constraints', 'data-action': 'toggle-constraints-tab' });
    statusConstraints.appendChild(ICON_FILTER.cloneNode(true));
    var statusConstraintCount = $create('span', { className: 'ca-status-constraint-count', textContent: '0' });
    statusConstraints.appendChild(statusConstraintCount);
    statusBar.appendChild(statusConstraints);
    minimalHeader.appendChild(statusBar);
    panel.appendChild(minimalHeader);

    var tabs = $create('div', { className: 'ca-tabs' });
    (function() { var ab = $create('button', { className: 'ca-tab active', 'data-action': 'switch-tab', 'data-tab': 'anchors', title: 'Anchors (Alt+1)' }); ab.appendChild(ICON_ANCHOR); tabs.appendChild(ab); })();
    (function() { var tb = $create('button', { className: 'ca-tab', 'data-action': 'switch-tab', 'data-tab': 'templates', title: 'Templates (Alt+2)' }); tb.appendChild(ICON_TEMPLATE); tabs.appendChild(tb); })();
    (function() { var bb = $create('button', { className: 'ca-tab', 'data-action': 'switch-tab', 'data-tab': 'bundles', title: 'Bundles (Alt+3)' }); bb.appendChild(ICON_BUNDLE); tabs.appendChild(bb); })();
    (function() { var cb = $create('button', { className: 'ca-tab', 'data-action': 'switch-tab', 'data-tab': 'constraints', title: 'Constraints (Alt+4)' }); cb.appendChild(ICON_FILTER); tabs.appendChild(cb); })();
    panel.appendChild(tabs);

    /* --- Anchors tab --- */
    panel.appendChild(tabContent('ca-tab-anchors', true, function(tc) {
      var search = $create('div', { className: 'ca-panel-search' });
      search.appendChild($create('input', { type: 'text', className: 'ca-search-input ca-input-isolation', 'data-action': 'search', placeholder: 'Search anchors...', 'aria-label': 'Search anchors' }));
      var fs = $create('select', { className: 'ca-filter-select', 'data-action': 'filter-status', 'aria-label': 'Filter by status' });
      fs.appendChild(opt('all', 'All')); fs.appendChild(opt('active', 'Active')); fs.appendChild(opt('inactive', 'Inactive'));
      fs.appendChild(opt('expired', 'Expired')); fs.appendChild(opt('global', 'Global')); fs.appendChild(opt('deleted', 'Trash'));
      search.appendChild(fs); tc.appendChild(search);
      var toolbar = $create('div', { className: 'ca-toolbar' });
      var sort = $create('select', { className: 'ca-sort-select', 'data-action': 'sort-anchors', 'aria-label': 'Sort anchors' });
      sort.appendChild(opt('newest', 'Newest')); sort.appendChild(opt('most-used', 'Most Used')); sort.appendChild(opt('recently-used', 'Recently Used'));
      toolbar.appendChild(sort);
      var imBtn = $create('button', { className: 'ca-btn-inject-mode', 'data-action': 'cycle-inject-mode', 'aria-label': 'Cycle injection mode' });
      imBtn.appendChild($create('span', { className: 'ca-inject-label', textContent: 'Prepend' }));
      toolbar.appendChild(imBtn);
      var inlineBtn = $create('button', { className: 'ca-btn-inline', 'data-action': 'toggle-inline-slash', 'aria-label': 'Toggle inline slash injection' });
      var inlineLabel = $create('span', { className: 'ca-inline-label', textContent: '\u00B6' });
      inlineBtn.appendChild(inlineLabel);
      toolbar.appendChild(inlineBtn);
      var gs = $create('select', { className: 'ca-sort-select', 'data-action': 'group-anchors', 'aria-label': 'Group anchors' });
      gs.appendChild(opt('none', 'No Grouping')); gs.appendChild(opt('tag', 'By Tag'));
      toolbar.appendChild(gs);
      tc.appendChild(toolbar);
      tc.appendChild(bulkBar('ca-bulk-bar', [
        { action: 'bulk-select-all', label: 'Select All' },
        { action: 'bulk-select-none', label: 'None' },
        { action: 'bulk-select-invert', label: 'Invert' }, '|',
        { action: 'bulk-toggle', label: 'Toggle' },
        { action: 'bulk-extend', label: '+5' },
        { action: 'bulk-add-tag', label: '+Tag' },
        { action: 'bulk-remove-tag', label: '-Tag' },
        { action: 'bulk-set-ttl', label: 'TTL' },
        { action: 'bulk-toggle-global', label: 'Global' },
        { action: 'bulk-export-anchors', label: 'Export' },
        { action: 'bulk-restore', label: 'Restore' },
        { action: 'bulk-delete', label: 'Delete', cls: ' ca-btn-danger' }
      ]));
      var body = $create('div', { className: 'ca-panel-body' });
      body.appendChild($create('ul', { className: 'ca-anchor-list', id: 'ca-anchor-list' }));
      tc.appendChild(body);
      var footer = $create('div', { className: 'ca-panel-footer' });
      footer.appendChild(btn('ca-btn-footer', 'export-all', 'Export All', 'Export All', ICON_EXPORT));
      footer.appendChild(btn('ca-btn-footer', 'import-all', 'Import', 'Import', ICON_IMPORT));
      footer.appendChild(btn('ca-btn-clear', 'clear-expired', 'Clear Expired', 'Clear Expired', ICON_CLEAR));
      tc.appendChild(footer);
      tc.appendChild($create('input', { type: 'file', className: 'ca-import-input', 'data-action': 'import-file', accept: '.json', 'aria-label': 'Import file' }));
    }));

    /* --- Templates tab --- */
    panel.appendChild(tabContent('ca-tab-templates', false, function(tc) {
      tc.appendChild(bulkBar('ca-bulk-bar-templates', [
        { action: 'bulk-select-all', label: 'Select All' },
        { action: 'bulk-select-none', label: 'None' },
        { action: 'bulk-select-invert', label: 'Invert' }, '|',
        { action: 'bulk-toggle-template-active', label: 'Toggle Active' },
        { action: 'bulk-add-tag', label: '+Tag' },
        { action: 'bulk-remove-tag', label: '-Tag' },
        { action: 'bulk-set-template-ttl', label: 'TTL' },
        { action: 'bulk-activate-templates', label: 'Instantiate' },
        { action: 'bulk-export-templates', label: 'Export' },
        { action: 'bulk-restore-templates', label: 'Restore' },
        { action: 'bulk-delete-templates', label: 'Delete', cls: ' ca-btn-danger' }
      ]));
      var search = $create('div', { className: 'ca-panel-search' });
      search.appendChild($create('input', { type: 'text', className: 'ca-search-input ca-input-isolation', 'data-action': 'search-templates', placeholder: 'Search templates...', 'aria-label': 'Search templates' }));
      var fs = $create('select', { className: 'ca-filter-select', 'data-action': 'filter-templates', 'aria-label': 'Filter templates' });
      fs.appendChild(opt('all', 'All')); fs.appendChild(opt('deleted', 'Trash'));
      search.appendChild(fs); tc.appendChild(search);
      var toolbar2 = $create('div', { className: 'ca-toolbar' });
      var sort2 = $create('select', { className: 'ca-sort-select', 'data-action': 'sort-templates', 'aria-label': 'Sort templates' });
      sort2.appendChild(opt('newest', 'Newest')); sort2.appendChild(opt('most-used', 'Most Used'));
      toolbar2.appendChild(sort2);
      var gst = $create('select', { className: 'ca-sort-select', 'data-action': 'group-templates', 'aria-label': 'Group templates' });
      gst.appendChild(opt('none', 'No Grouping')); gst.appendChild(opt('tag', 'By Tag'));
      toolbar2.appendChild(gst); tc.appendChild(toolbar2);
      var body2 = $create('div', { className: 'ca-panel-body' });
      body2.appendChild($create('ul', { className: 'ca-template-list', id: 'ca-template-list' }));
      tc.appendChild(body2);
      var footer2 = $create('div', { className: 'ca-panel-footer' });
      footer2.appendChild(btn('ca-btn-footer', 'export-all-templates', 'Export All', 'Export All', ICON_EXPORT));
      footer2.appendChild(btn('ca-btn-footer', 'import-templates', 'Import', 'Import', ICON_IMPORT));
      footer2.appendChild(btn('ca-btn-footer', 'toggle-all-templates', 'Toggle All', 'Toggle All', ICON_TOGGLE));
      footer2.appendChild(btn('ca-btn-clear', 'add-template', 'New Template', 'New Template', ICON_ADD));
      tc.appendChild(footer2);
      tc.appendChild($create('input', { type: 'file', className: 'ca-import-input', 'data-action': 'import-templates-file', accept: '.json', 'aria-label': 'Import templates file' }));
    }));

    /* --- Bundles tab --- */
    panel.appendChild(tabContent('ca-tab-bundles', false, function(tc) {
      tc.appendChild(bulkBar('ca-bulk-bar-bundles', [
        { action: 'bulk-select-all', label: 'Select All' },
        { action: 'bulk-select-none', label: 'None' },
        { action: 'bulk-select-invert', label: 'Invert' }, '|',
        { action: 'bulk-toggle-members', label: 'Toggle Members' },
        { action: 'bulk-extend-members', label: '+5 Members' },
        { action: 'bulk-set-members-ttl', label: 'TTL Members' },
        { action: 'bulk-add-tag', label: '+Tag' },
        { action: 'bulk-export-bundles', label: 'Export' },
        { action: 'bulk-restore-bundles', label: 'Restore' },
        { action: 'bulk-delete-bundles', label: 'Delete', cls: ' ca-btn-danger' }
      ]));
      var search3 = $create('div', { className: 'ca-panel-search' });
      search3.appendChild($create('input', { type: 'text', className: 'ca-search-input ca-input-isolation', 'data-action': 'search-bundles', placeholder: 'Search bundles...', 'aria-label': 'Search bundles' }));
      var fs3 = $create('select', { className: 'ca-filter-select', 'data-action': 'filter-bundles', 'aria-label': 'Filter bundles' });
      fs3.appendChild(opt('all', 'All')); fs3.appendChild(opt('deleted', 'Trash'));
      search3.appendChild(fs3); tc.appendChild(search3);
      var toolbar3 = $create('div', { className: 'ca-toolbar' });
      var sort3 = $create('select', { className: 'ca-sort-select', 'data-action': 'sort-bundles', 'aria-label': 'Sort bundles' });
      sort3.appendChild(opt('newest', 'Newest')); sort3.appendChild(opt('most-used', 'Most Used'));
      toolbar3.appendChild(sort3); tc.appendChild(toolbar3);
      var body3 = $create('div', { className: 'ca-panel-body' });
      body3.appendChild($create('ul', { className: 'ca-bundle-list', id: 'ca-bundle-list' }));
      tc.appendChild(body3);
      var footer3 = $create('div', { className: 'ca-panel-footer' });
      footer3.appendChild(btn('ca-btn-footer', 'export-all-bundles', 'Export All', 'Export All', ICON_EXPORT));
      footer3.appendChild(btn('ca-btn-footer', 'import-bundles', 'Import', 'Import', ICON_IMPORT));
      footer3.appendChild(btn('ca-btn-clear', 'add-bundle', 'New Bundle', 'New Bundle', ICON_ADD));
      footer3.appendChild(btn('ca-btn-clear ca-bundle-deactivate', 'deactivate-all-bundles', 'Deactivate All', 'Deactivate All', ICON_DEACTIVATE));
      tc.appendChild(footer3);
      tc.appendChild($create('input', { type: 'file', className: 'ca-import-input', 'data-action': 'import-bundles-file', accept: '.json', 'aria-label': 'Import bundles file' }));
    }));

    /* --- Constraints tab --- */
    panel.appendChild(tabContent('ca-tab-constraints', false, function(tc) {
      var search4 = $create('div', { className: 'ca-panel-search' });
      search4.appendChild($create('input', { type: 'text', className: 'ca-search-input ca-input-isolation', 'data-action': 'search-constraints', placeholder: 'Search constraints...', 'aria-label': 'Search constraints' }));
      var fs4 = $create('select', { className: 'ca-filter-select', 'data-action': 'filter-constraints', 'aria-label': 'Filter constraints' });
      fs4.appendChild(opt('all', 'All')); fs4.appendChild(opt('active', 'Active')); fs4.appendChild(opt('inactive', 'Inactive')); fs4.appendChild(opt('deleted', 'Trash'));
      search4.appendChild(fs4); tc.appendChild(search4);
      var toolbar4 = $create('div', { className: 'ca-toolbar' });
      var sort4 = $create('select', { className: 'ca-sort-select', 'data-action': 'sort-constraints', 'aria-label': 'Sort constraints' });
      sort4.appendChild(opt('newest', 'Newest')); sort4.appendChild(opt('priority', 'By Priority'));
      toolbar4.appendChild(sort4); tc.appendChild(toolbar4);
      tc.appendChild(bulkBar('ca-bulk-bar-constraints', [
        { action: 'bulk-select-all', label: 'Select All' },
        { action: 'bulk-select-none', label: 'None' },
        { action: 'bulk-select-invert', label: 'Invert' }, '|',
        { action: 'bulk-toggle-constraints', label: 'Toggle Active' },
        { action: 'bulk-export-constraints', label: 'Export' },
        { action: 'bulk-restore-constraints', label: 'Restore' },
        { action: 'bulk-delete-constraints', label: 'Delete', cls: ' ca-btn-danger' }
      ]));
      var body4 = $create('div', { className: 'ca-panel-body' });
      body4.appendChild($create('ul', { className: 'ca-constraint-list', id: 'ca-constraint-list' }));
      tc.appendChild(body4);
      var footer4 = $create('div', { className: 'ca-panel-footer' });
      footer4.appendChild(btn('ca-btn-footer', 'export-all-constraints', 'Export All', 'Export All', ICON_EXPORT));
      footer4.appendChild(btn('ca-btn-footer', 'import-constraints', 'Import', 'Import', ICON_IMPORT));
      footer4.appendChild(btn('ca-btn-footer', 'toggle-all-constraints', 'Toggle All', 'Toggle All', ICON_TOGGLE));
      footer4.appendChild(btn('ca-btn-clear', 'add-constraint', 'New Constraint', 'New Constraint', ICON_ADD));
      tc.appendChild(footer4);
      tc.appendChild($create('input', { type: 'file', className: 'ca-import-input', 'data-action': 'import-constraints-file', accept: '.json', 'aria-label': 'Import constraints file' }));
    }));

    window.__ca.shared.$append(panel);


    /* Append controls and hint to minimal header */
    var panelEl = window.__ca.shared.$id('ca-panel');
    if (panelEl) {
      (function() {
        var ns = 'http://www.w3.org/2000/svg';
        var minHeader = window.__ca.shared.$one('.ca-minimal-header');
        if (!minHeader) return;
        /* Hint dots — first child, always visible; toggles .show-tools */
        var hint = window.__ca.shared.$create('button', { className: 'ca-minimal-hint', 'data-action': 'toggle-minimal-tools', 'aria-label': 'Toggle search and filters', textContent: '\u00B7\u00B7\u00B7' });
        minHeader.appendChild(hint);

        /* Lock button */
        var lockBtn = window.__ca.shared.$create('button', { className: 'ca-minimal-lock', 'data-action': 'toggle-lock', 'aria-label': 'Lock panel' });
        var lockSvg = document.createElementNS(ns, 'svg');
        lockSvg.setAttribute('viewBox', '0 0 24 24');
        lockSvg.setAttribute('fill', 'none');
        lockSvg.setAttribute('stroke', 'currentColor');
        lockSvg.setAttribute('stroke-width', '2');
        var lockRect = document.createElementNS(ns, 'rect');
        lockRect.setAttribute('x', '3'); lockRect.setAttribute('y', '11');
        lockRect.setAttribute('width', '18'); lockRect.setAttribute('height', '11');
        lockRect.setAttribute('rx', '2');
        var lockPath = document.createElementNS(ns, 'path');
        lockPath.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
        lockSvg.appendChild(lockRect);
        lockSvg.appendChild(lockPath);
        lockBtn.appendChild(lockSvg);
        minHeader.appendChild(lockBtn);

        /* Mode toggle button */
        var modeBtn = window.__ca.shared.$create('button', { className: 'ca-btn-mode-toggle', 'data-action': 'toggle-panel-mode', 'aria-label': 'Switch to full' });
        modeBtn.appendChild(ICON_EXPAND.cloneNode(true));
        minHeader.appendChild(modeBtn);
      })();
    }
    renderBadge();
    updateAnchorList();
    updateTemplateList();
    updateBadge();
    updateConstraintBadge();
    updatePanelStatusBar();
    updateInjectModeLabel();
    if (window.__ca.state.health && window.__ca.state.health !== 'offline') {
      updateHealthDot(window.__ca.state.health);
    }
    setupPanelEvents();
  }


  function renderTurnPopup(rect, onCreate) {
    var $create = window.__ca.shared.$create;

    var popup = $create('div', { id: 'ca-turn-popup', className: 'ca-turn-popup' });

    var turnTitle = $create('div', { className: 'ca-turn-popup-title', textContent: 'Turns' });
    popup.appendChild(turnTitle);

    var turnOptions = [1, 3, 5, 10, 25, 50];
    for (var i = 0; i < turnOptions.length; i++) {
      var tBtn = $create('button', { className: 'ca-turn-option', 'data-turns': String(turnOptions[i]), textContent: turnOptions[i] });
      popup.appendChild(tBtn);
    }

    var turnCustom = $create('input', { id: 'ca-turn-custom-val', className: 'ca-turn-custom', type: 'number', min: '1', placeholder: 'Custom' });
    popup.appendChild(turnCustom);

    var turnSetBtn = $create('button', { className: 'ca-turn-option ca-turn-custom-btn', textContent: 'Set' });
    popup.appendChild(turnSetBtn);

    var divider = $create('div', { className: 'ca-turn-popup-divider' });
    popup.appendChild(divider);

    var ttlTitle = $create('div', { className: 'ca-turn-popup-title', textContent: 'TTL (idle expiry)' });
    popup.appendChild(ttlTitle);

    var ttlLabels = ['15m', '30m', '45m', '1h', '3h', '6h', '12h', '24h', '3d', '7d', '30d'];
    var ttlMinutes = [15, 30, 45, 60, 180, 360, 720, 1440, 4320, 10080, 43200];
    for (var ti = 0; ti < ttlLabels.length; ti++) {
      var ttBtn = $create('button', { className: 'ca-turn-option', 'data-ttl': String(ttlMinutes[ti]), textContent: ttlLabels[ti] });
      popup.appendChild(ttBtn);
    }

    var noTtlBtn = $create('button', { className: 'ca-turn-option ca-ttl-none', 'data-ttl': 'none', textContent: 'No TTL' });
    popup.appendChild(noTtlBtn);

    var ttlCustom = $create('input', { id: 'ca-ttl-custom-val', className: 'ca-turn-custom', type: 'number', min: '1', placeholder: 'Custom mins' });
    popup.appendChild(ttlCustom);

    var ttlSetBtn = $create('button', { className: 'ca-turn-option ca-turn-custom-btn', textContent: 'Set' });
    popup.appendChild(ttlSetBtn);

    var descDivider = $create('div', { className: 'ca-turn-popup-divider' });
    popup.appendChild(descDivider);

    var descPopupTitle = $create('div', { className: 'ca-turn-popup-title', textContent: 'Description' });
    popup.appendChild(descPopupTitle);

    var descPopupInput = $create('input', { id: 'ca-turn-desc', className: 'ca-turn-custom ca-turn-desc', type: 'text', placeholder: 'Short description...' });
    popup.appendChild(descPopupInput);

    var srcDivider = $create('div', { className: 'ca-turn-popup-divider' });
    popup.appendChild(srcDivider);

    var srcPopupTitle = $create('div', { className: 'ca-turn-popup-title', textContent: 'Source URL' });
    popup.appendChild(srcPopupTitle);

    var srcPopupInput = $create('input', {
      id: 'ca-turn-source-url',
      className: 'ca-turn-custom ca-turn-source',
      type: 'text',
      value: typeof window !== 'undefined' ? window.location.href : '',
      placeholder: 'Source URL...'
    });
    popup.appendChild(srcPopupInput);

    var createBtn = $create('button', { className: 'ca-turn-option ca-create-btn', textContent: 'Create' });
    popup.appendChild(createBtn);

    popup.style.visibility = 'hidden';
    popup.style.position = 'fixed';
    popup.style.top = '0';
    window.__ca.shared.$append(popup);

    var actualBounds = popup.getBoundingClientRect();
    popup.style.visibility = '';

    var popupWidth = actualBounds.width;
    popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 16)) + 'px';

    var popupTop = rect.bottom + 8;
    if (popupTop + actualBounds.height > window.innerHeight - 16) {
      var aboveTop = rect.top - actualBounds.height - 8;
      if (aboveTop >= 8) {
        popupTop = aboveTop;
      } else {
        popupTop = 8;
        popup.style.maxHeight = (window.innerHeight - 24) + 'px';
        popup.style.overflowY = 'auto';
      }
    }
    popup.style.top = popupTop + 'px';

    var selectedTurns = lastPopupTurns;
    var selectedTTL = lastPopupTTL;
    if (lastPopupTurns) highlightTurnOption(popup, lastPopupTurns);
    if (lastPopupTTL !== undefined) highlightTTLOption(popup, lastPopupTTL);

    popup.addEventListener('click', function(e) {
      var target = e.target.closest('[data-turns]');
      if (target) {
        selectedTurns = parseInt(target.dataset.turns, 10);
        highlightTurnOption(popup, selectedTurns);
        return;
      }
      if (e.target === turnSetBtn) {
        var cVal = parseInt(turnCustom.value, 10);
        if (cVal > 0) {
          selectedTurns = cVal;
          highlightTurnOption(popup, cVal);
        }
        return;
      }
      var ttlTarget = e.target.closest('[data-ttl]');
      if (ttlTarget) {
        selectedTTL = ttlTarget.dataset.ttl === 'none' ? null : parseInt(ttlTarget.dataset.ttl, 10);
        highlightTTLOption(popup, selectedTTL);
        return;
      }
      if (e.target === ttlSetBtn) {
        var tVal = parseInt(ttlCustom.value, 10);
        if (tVal > 0) {
          selectedTTL = tVal;
          highlightTTLOption(popup, tVal);
        }
        return;
      }
      if (e.target === createBtn) {
        if (selectedTurns === null) selectedTurns = 10;
        var descVal = descPopupInput.value.trim().substring(0, 80) || '';
        var srcVal = srcPopupInput.value.trim() || '';
        lastPopupTurns = selectedTurns;
        lastPopupTTL = selectedTTL;
        onCreate(selectedTurns, selectedTTL, descVal, srcVal);
        removeTurnPopup();
      }
    });

    var dismissHandler = function(e) {
      if (!popup.contains(e.target)) {
        removeTurnPopup();
      }
    };
    popup._dismissHandler = dismissHandler;
    window.__ca.ROOT.addEventListener('mousedown', dismissHandler);

    popup._docHandler = function(e) {
      if (e.target !== window.__ca.HOST) {
        removeTurnPopup();
      }
    };
    document.addEventListener('mousedown', popup._docHandler);
  }
  function renderBadge() {
    var $create = window.__ca.shared.$create;
    var trigger = window.__ca.shared.$one('.ca-trigger-zone');
    if (!trigger) return;
    if (!window.__ca.shared.$id('ca-context-badge')) {
      var badge = $create('div', { id: 'ca-context-badge', className: 'ca-trigger-badge' });
      trigger.appendChild(badge);
    }
  }

  function trapFocus(container) {
    container.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      var focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  function renderConfirmDialog(message, onConfirm) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var overlay = $create('div', { id: 'ca-confirm-overlay', className: 'ca-confirm-overlay' });

    var dialog = $create('div', { className: 'ca-confirm-dialog' });
    var msgP = $create('p', { className: 'ca-confirm-message', textContent: esc(message) });
    dialog.appendChild(msgP);

    var actions = $create('div', { className: 'ca-confirm-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'confirm-cancel', textContent: 'Cancel' });
    var confirmBtn = $create('button', { className: 'ca-btn-danger', 'data-action': 'confirm-ok', textContent: 'Confirm' });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return removeConfirmDialog();
      var target = e.target.closest('[data-action]');
      if (!target) return;
      removeConfirmDialog();
      if (target.dataset.action === 'confirm-ok' && onConfirm) {
        onConfirm();
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        removeConfirmDialog();
      }
    });

    cancelBtn.focus();
    trapFocus(dialog);
  }

  function removeConfirmDialog() {
    var overlay = window.__ca.shared.$id('ca-confirm-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function renderMismatchDialog(message, onNavigate, onImportAnyway) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var overlay = $create('div', { id: 'ca-confirm-overlay', className: 'ca-confirm-overlay' });

    var dialog = $create('div', { className: 'ca-confirm-dialog' });
    var msgP = $create('p', { className: 'ca-confirm-message', textContent: esc(message) });
    dialog.appendChild(msgP);

    var actions = $create('div', { className: 'ca-confirm-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn', 'data-action': 'mismatch-import', textContent: 'Import anyway' });
    var navigateBtn = $create('button', { className: 'ca-btn-danger', 'data-action': 'mismatch-navigate', textContent: 'Navigate to session' });
    actions.appendChild(cancelBtn);
    actions.appendChild(navigateBtn);
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return removeConfirmDialog();
      var target = e.target.closest('[data-action]');
      if (!target) return;
      removeConfirmDialog();
      if (target.dataset.action === 'mismatch-navigate' && onNavigate) {
        onNavigate();
      } else if (target.dataset.action === 'mismatch-import' && onImportAnyway) {
        onImportAnyway();
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        removeConfirmDialog();
      }
    });

    cancelBtn.focus();
  }

  function renderBulkTagDialog(onTagsSelected, mode) {
    mode = mode || 'add';
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var tags = (window.__ca.storage.getTags() || []).sort();
    var selectedTags = [];

    var overlay = $create('div', { id: 'ca-bulk-dialog-overlay', className: 'ca-confirm-overlay' });
    var dialog = $create('div', { className: 'ca-bulk-dialog' });

    var actionLabel = mode === 'add' ? 'Add Tags' : 'Remove Tags';
    var confirmLabel = mode === 'add' ? 'Apply Tags' : 'Remove Tags';
    var title = $create('h3', { className: 'ca-bulk-dialog-title', textContent: actionLabel + ' — ' + _bulkState().selectedIds.length + ' Item' + (_bulkState().selectedIds.length > 1 ? 's' : '') });
    dialog.appendChild(title);

    var input = $create('input', {
      id: 'ca-bulk-tag-input',
      className: 'ca-bulk-tag-input',
      type: 'text',
      placeholder: 'Type tag name and press Enter or click below...',
      'data-action': 'bulk-tag-type'
    });
    dialog.appendChild(input);

    var list = $create('div', { id: 'ca-bulk-tag-list', className: 'ca-bulk-tag-list' });

    function renderTagList() {
      while (list.firstChild) list.removeChild(list.firstChild);
      var query = input.value.trim().toLowerCase();
      var shown = 0;
      for (var i = 0; i < tags.length; i++) {
        if (!query || tags[i].toLowerCase().indexOf(query) !== -1) {
          var isSelected = selectedTags.indexOf(tags[i]) !== -1;
          var chip = $create('div', {
            className: 'ca-bulk-tag-chip' + (isSelected ? ' selected' : ''),
            'data-action': 'bulk-tag-pick',
            'data-tag': escAttr(tags[i]),
            textContent: esc(tags[i]) + (isSelected ? ' ✓' : '')
          });
          list.appendChild(chip);
          shown++;
        }
      }
      if (shown === 0 && query) {
        var newTagChip = $create('div', {
          className: 'ca-bulk-tag-chip ca-bulk-tag-new',
          'data-action': 'bulk-tag-pick',
          'data-tag': escAttr(query),
          textContent: 'Create "' + esc(query) + '"'
        });
        list.appendChild(newTagChip);
      }
    }

    dialog.appendChild(list);

    var actions = $create('div', { className: 'ca-confirm-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'confirm-cancel', textContent: 'Cancel' });
    var confirmBtn = $create('button', { className: 'ca-btn-primary', 'data-action': 'bulk-tag-confirm', textContent: confirmLabel + ' (' + selectedTags.length + ')' });
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    function updateConfirmLabel() {
      confirmBtn.textContent = confirmLabel + ' (' + selectedTags.length + ')';
    }

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return removeBulkDialog();
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;

      if (action === 'confirm-cancel') {
        removeBulkDialog();
      } else if (action === 'bulk-tag-pick') {
        var tag = target.dataset.tag;
        var idx = selectedTags.indexOf(tag);
        if (idx === -1) {
          selectedTags.push(tag);
        } else {
          selectedTags.splice(idx, 1);
        }
        renderTagList();
        updateConfirmLabel();
      } else if (action === 'bulk-tag-confirm') {
        if (selectedTags.length > 0 && onTagsSelected) {
          onTagsSelected(selectedTags);
        }
        removeBulkDialog();
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') removeBulkDialog();
      if (e.key === 'Enter' && document.activeElement === input) {
        var val = input.value.trim().toLowerCase();
        if (val) {
          var idx = selectedTags.indexOf(val);
          if (idx === -1) {
            selectedTags.push(val);
          } else {
            selectedTags.splice(idx, 1);
          }
          input.value = '';
          renderTagList();
          updateConfirmLabel();
        }
      }
    });

    input.addEventListener('input', renderTagList);

    renderTagList();
    input.focus();
  }

  function renderBulkTTLDialog(onTTLSet) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var overlay = $create('div', { id: 'ca-bulk-dialog-overlay', className: 'ca-confirm-overlay' });
    var dialog = $create('div', { className: 'ca-bulk-dialog' });

    var title = $create('h3', { className: 'ca-bulk-dialog-title', textContent: 'Set TTL for ' + _bulkState().selectedIds.length + ' Item' + (_bulkState().selectedIds.length > 1 ? 's' : '') });
    dialog.appendChild(title);

    var row = $create('div', { className: 'ca-bulk-ttl-row' });
    var numInput = $create('input', {
      id: 'ca-bulk-ttl-value',
      className: 'ca-bulk-ttl-input',
      type: 'number',
      min: '1',
      max: '99999',
      placeholder: 'Value'
    });
    row.appendChild(numInput);

    var unitSelect = $create('select', {
      id: 'ca-bulk-ttl-unit',
      className: 'ca-bulk-ttl-unit',
      'data-action': 'bulk-ttl-unit'
    });
    var optMinutes = $create('option', { value: 'minutes', textContent: 'Minutes' });
    var optHours = $create('option', { value: 'hours', textContent: 'Hours' });
    var optDays = $create('option', { value: 'days', textContent: 'Days' });
    unitSelect.appendChild(optMinutes);
    unitSelect.appendChild(optHours);
    unitSelect.appendChild(optDays);
    row.appendChild(unitSelect);
    dialog.appendChild(row);

    var clearRow = $create('div', { className: 'ca-bulk-ttl-clear-row' });
    var clearBtn = $create('button', {
      className: 'ca-btn-cancel',
      'data-action': 'bulk-ttl-clear',
      textContent: 'Clear TTL on all selected'
    });
    clearRow.appendChild(clearBtn);
    dialog.appendChild(clearRow);

    var actions = $create('div', { className: 'ca-confirm-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'confirm-cancel', textContent: 'Cancel' });
    var setBtn = $create('button', { className: 'ca-btn-primary', 'data-action': 'bulk-ttl-set', textContent: 'Set TTL' });
    actions.appendChild(cancelBtn);
    actions.appendChild(setBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return removeBulkDialog();
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;

      if (action === 'confirm-cancel') {
        removeBulkDialog();
      } else if (action === 'bulk-ttl-clear') {
        if (onTTLSet) onTTLSet(null);
        removeBulkDialog();
      } else if (action === 'bulk-ttl-set') {
        var val = parseInt(numInput.value, 10);
        if (isNaN(val) || val < 1) {
          numInput.focus();
          numInput.style.borderColor = 'red';
          return;
        }
        numInput.style.borderColor = '';
        var minutes;
        if (unitSelect.value === 'days') minutes = val * 1440;
        else if (unitSelect.value === 'hours') minutes = val * 60;
        else minutes = val;
        if (onTTLSet) onTTLSet(minutes);
        removeBulkDialog();
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') removeBulkDialog();
    });

    numInput.focus();
  }

  function removeBulkDialog() {
    var overlay = window.__ca.shared.$id('ca-bulk-dialog-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }







  function highlightTurnOption(popup, value) {
    var buttons = popup.querySelectorAll('[data-turns]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].className = 'ca-turn-option';
    }
    var matched = popup.querySelector('[data-turns="' + value + '"]');
    if (matched) matched.className = 'ca-turn-option selected';
  }

  function highlightTTLOption(popup, value) {
    var buttons = popup.querySelectorAll('[data-ttl]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].className = 'ca-turn-option';
    }
    if (value === null) {
      var noneBtn = popup.querySelector('[data-ttl="none"]');
      if (noneBtn) noneBtn.className = 'ca-turn-option selected';
    } else {
      var valStr = String(value);
      var matched = popup.querySelector('[data-ttl="' + valStr + '"]');
      if (matched) matched.className = 'ca-turn-option selected';
    }
  }

  function removeTurnPopup() {
    var popup = window.__ca.shared.$id('ca-turn-popup');
    if (popup && popup.parentNode) {
      if (popup._dismissHandler) {
        window.__ca.ROOT.removeEventListener('mousedown', popup._dismissHandler);
      }
      if (popup._docHandler) {
        document.removeEventListener('mousedown', popup._docHandler);
      }
      popup.parentNode.removeChild(popup);
    }
  }

  function updateBadge() {
    var badge = window.__ca.shared.$id('ca-context-badge');
    if (!badge) return;
    var activeId = window.__ca.storage.getActiveBundleId();
    if (activeId) {
      var bundles = window.__ca.storage.getBundles();
      var bun = null;
      for (var bi = 0; bi < bundles.length; bi++) {
        if (bundles[bi].id === activeId) { bun = bundles[bi]; break; }
      }
      if (bun) {
        var words = bun.name.split(/\s+/);
        if (words.length >= 2) {
          var abbr = words[0].charAt(0) + words[1].charAt(0);
        } else {
          var abbr = bun.name.substring(0, 2);
        }
        abbr = abbr.toUpperCase();
        badge.textContent = abbr;
        badge.title = bun.name;
        badge.className = 'ca-trigger-badge visible exclusive';
        badge.style.removeProperty('background');
        badge.style.removeProperty('--ca-badge-tail');
        updateConstraintBadge();
        return;
      }
    }
    var active = window.__ca.storage.getActive();
    if (active.length > 0) {
      var display = active.length > 99 ? '99+' : String(active.length);
      if (display !== lastBadgeValue) {
        badge.textContent = display;
        lastBadgeValue = display;
      }
      if (active.length > 99) {
        badge.style.background = '#e67e22';
        badge.style.setProperty('--ca-badge-tail', '#e67e22');
      } else {
        badge.style.removeProperty('background');
        badge.style.removeProperty('--ca-badge-tail');
      }
      badge.title = active.length + ' active anchors';
      badge.className = 'ca-trigger-badge visible';
    } else {
      badge.title = '';
      badge.className = 'ca-trigger-badge';
      badge.style.removeProperty('background');
      badge.style.removeProperty('--ca-badge-tail');
    }
    updateConstraintBadge();
  }

  function updateConstraintBadge() {
    var badge = window.__ca.shared.$id('ca-constraint-badge');
    if (badge) {
      var active = window.__ca.storage.getActiveConstraints();
      if (active.length > 0) {
        badge.textContent = String(active.length);
        badge.title = active.length + ' active constraint' + (active.length > 1 ? 's' : '');
        badge.className = 'ca-constraint-badge visible';
      } else {
        badge.textContent = '';
        badge.title = '';
        badge.className = 'ca-constraint-badge';
      }
    }
    updatePanelStatusBar();
  }

  function updatePanelStatusBar() {
    var profileNameEl = window.__ca.shared.$one('.ca-status-profile-name');
    var constraintCountEl = window.__ca.shared.$one('.ca-status-constraint-count');
    if (!profileNameEl || !constraintCountEl) return;

    var activeProfile = window.__ca.storage.getActiveProfile();
    if (activeProfile && activeProfile.name) {
      profileNameEl.textContent = activeProfile.name;
      profileNameEl.className = 'ca-status-profile-name';
    } else {
      profileNameEl.textContent = 'No profile';
      profileNameEl.className = 'ca-status-profile-name dimmed';
    }

    var active = window.__ca.storage.getActiveConstraints();
    var count = active ? active.length : 0;
    constraintCountEl.textContent = String(count);
  }

  function updateInjectModeLabel() {
    var label = window.__ca.shared.$one('.ca-inject-label');
    if (label) {
      var mode = window.__ca.storage.getInjectionMode();
      var labels = { prepend: 'Prepend', append: 'Append', intermittent: 'Intermittent' };
      label.textContent = labels[mode] || 'Prepend';
    }
  }

  function updateInlineSlashLabel() {
    var label = window.__ca.shared.$one('.ca-inline-label');
    if (label) {
      label.textContent = window.__ca.storage.getSetting('inlineSlash') ? '\u2014' : '\u00B6';
    }
  }

  function getFilteredAnchors() {
    var anchors = window.__ca.storage.getSorted(currentSort);
    var filtered = anchors;

    if (currentFilter === 'active') {
      filtered = filtered.filter(window.__ca.panelMath.isActiveAnchor);
    } else if (currentFilter === 'inactive') {
      filtered = filtered.filter(window.__ca.panelMath.isInactiveAnchor);
    } else if (currentFilter === 'expired') {
      filtered = filtered.filter(window.__ca.panelMath.isExpiredAnchor);
    } else if (currentFilter === 'global') {
      filtered = filtered.filter(window.__ca.panelMath.isGlobalAnchor);
    } else if (currentFilter === 'deleted') {
      filtered = window.__ca.storage.getSoftDeleted('anchors');
    }

    if (currentSearch) {
      var term = currentSearch.toLowerCase();
      if (term.charAt(0) === '#' && term.length > 1) {
        var tagName = term.substring(1);
        filtered = window.__ca.storage.getAnchorsByTag(tagName);
      } else {
        filtered = filtered.filter(function(a) {
          return a.text.toLowerCase().indexOf(term) !== -1 ||
            (a.sourceUrl && a.sourceUrl.toLowerCase().indexOf(term) !== -1) ||
            (a.tags && a.tags.some(function(t) { return t.toLowerCase().indexOf(term) !== -1; }));
        });
      }
    }

    return filtered;
  }

  function buildAnchorItem(a) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var isExpired = window.__ca.panelMath.isExpiredAnchor(a);
    var isExpiring = !isExpired && a.turnsRemaining <= 3;
    var itemClass = 'ca-anchor-item' + (a.active ? '' : ' inactive');
    if (a.global) itemClass += ' global';
    if (a.deleted) itemClass += ' deleted';

    var turnsClass = 'ca-anchor-turns' + (isExpiring ? ' expiring' : '') + (isExpired ? ' expired' : '');

    var li = $create('li', { className: itemClass, 'data-id': a.id });
    if (!a.deleted) li.draggable = true;

    var panelEl = window.__ca.shared.$id('ca-panel');
    if (_bulkState().enabled && !(panelEl && panelEl.classList.contains('minimal'))) {
      var cb = $create('div', {
        className: 'ca-bulk-checkbox' + (_bulkState().selectedIds.indexOf(a.id) !== -1 ? ' checked' : ''),
        'data-action': 'bulk-select',
        'data-id': a.id
      });
      li.appendChild(cb);
    }

    var content = $create('div', { className: 'ca-anchor-content' });

    var duplicates = window.__ca.storage.findByText(a.text).filter(function(d) { return d.id !== a.id; });
    if (duplicates.length > 0) {
      var dupBadge = $create('span', { className: 'ca-duplicate-badge', textContent: 'Duplicate (' + duplicates.length + ')' });
      content.appendChild(dupBadge);
    }

    if (a.description) {
      var descEl = $create('p', {
        className: 'ca-anchor-desc',
        textContent: esc(a.description)
      });
      content.appendChild(descEl);
    }

    var textP = $create('p', {
      className: 'ca-anchor-text',
      textContent: esc(a.text),
      'data-action': 'expand-text',
      'data-id': a.id
    });
    content.appendChild(textP);

    var footer = $create('div', { className: 'ca-anchor-footer' });

    var footerInfo = $create('div', { className: 'ca-anchor-footer-info' });

    var turnsSpan = $create('span', { className: turnsClass, textContent: esc(a.turnsRemaining) + '/' + esc(a.turnsTotal) });
    footerInfo.appendChild(turnsSpan);

    if (a.ttlMinutes !== null && a.ttlExpiresAt !== null) {
      var ttlRemaining = a.ttlExpiresAt - Date.now();
      if (ttlRemaining > 0) {
        var remainingMins = Math.ceil(ttlRemaining / 60000);
        var ttlClass = 'ca-ttl-pill' + (remainingMins < 60 ? ' warning' : '');
        var ttlText = window.__ca.shared.formatTTL(remainingMins);
        var ttlPill = $create('span', { className: ttlClass });
        var ttlIcon = ICON_TTL.cloneNode(true);
        ttlIcon.setAttribute('class', 'ca-ttl-icon');
        ttlPill.appendChild(ttlIcon);
        ttlPill.appendChild(document.createTextNode(' ' + ttlText));
        footerInfo.appendChild(ttlPill);
      }
    }

    if (a.tags && a.tags.length > 0) {
      for (var t = 0; t < a.tags.length; t++) {
        var tagSpan = $create('span', { className: 'ca-tag', 'data-action': 'filter-tag', 'data-tag': escAttr(a.tags[t]), textContent: '#' + esc(a.tags[t]) });
        footerInfo.appendChild(tagSpan);
      }
    }

    if (a.triggerKeywords && a.triggerKeywords.length > 0) {
      for (var tki = 0; tki < a.triggerKeywords.length; tki++) {
        var kwChip = $create('span', { className: 'ca-trigger-chip', textContent: esc(a.triggerKeywords[tki]) });
        footerInfo.appendChild(kwChip);
      }
    }

    var globalBtn = $create('button', {
      className: 'ca-btn-global' + (a.global ? ' active' : ''),
      'data-action': 'toggle-global',
      'data-id': a.id,
      textContent: a.global ? 'Global' : 'Local'
    });
    footerInfo.appendChild(globalBtn);

    var extendBtn = $create('button', { className: 'ca-btn-extend', 'data-action': 'extend-turns', 'data-id': a.id, textContent: '+5', 'aria-label': 'Extend turns' });
    footerInfo.appendChild(extendBtn);

    if (a.usageCount && a.usageCount > 0) {
      var usageSpan = $create('span', { className: 'ca-anchor-usage', textContent: esc(a.usageCount) + ' uses' });
      footerInfo.appendChild(usageSpan);
    }

    if (a.toneProfile || (a.domainFocus && a.domainFocus.length > 0) || a.socraticTrigger || a.uncertaintyProtocol || a.outputRequirements) {
      var behBadge = $create('span', { className: 'ca-behavior-badge', 'data-action': 'edit-behavior', 'data-id': a.id, textContent: 'B' });
      footerInfo.appendChild(behBadge);
    }

    footer.appendChild(footerInfo);

    var footerActions = $create('div', { className: 'ca-anchor-footer-actions' });

    var copyBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'copy-anchor', 'data-id': a.id, 'aria-label': 'Copy anchor', title: 'Copy' });
    copyBtn.appendChild(ICON_COPY.cloneNode(true));
    footerActions.appendChild(copyBtn);

    var injectBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'inject-anchor', 'data-id': a.id, 'aria-label': 'Inject anchor', title: 'Inject' });
    injectBtn.appendChild(ICON_INJECT.cloneNode(true));
    footerActions.appendChild(injectBtn);

    var exportBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'export-anchor', 'data-id': a.id, 'aria-label': 'Export anchor', title: 'Export' });
    exportBtn.appendChild(ICON_EXPORT.cloneNode(true));
    footerActions.appendChild(exportBtn);

    var editBtn = $create('button', { className: 'ca-btn-edit', 'data-action': 'edit-anchor', 'data-id': a.id, 'aria-label': 'Edit anchor' });
    editBtn.appendChild(ICON_EDIT.cloneNode(true));
    footerActions.appendChild(editBtn);

    var deleteBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'delete-anchor', 'data-id': a.id, 'aria-label': 'Delete anchor' });
    deleteBtn.appendChild(ICON_DELETE.cloneNode(true));
    footerActions.appendChild(deleteBtn);

    footer.appendChild(footerActions);
    content.appendChild(footer);

    var actions = $create('div', { className: 'ca-anchor-actions' });

    if (a.deleted) {
      var deletedLabel = $create('span', { className: 'ca-anchor-usage', textContent: 'Deleted ' + esc(getRelativeTime(a.deletedAt || a.createdAt)) });
      actions.appendChild(deletedLabel);
      var restoreBtn = $create('button', { className: 'ca-btn-activate', 'data-action': 'restore-anchor', 'data-id': a.id, textContent: 'Restore' });
      actions.appendChild(restoreBtn);
      var purgeBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'purge-anchor', 'data-id': a.id, 'aria-label': 'Delete permanently' });
      purgeBtn.appendChild(ICON_DELETE.cloneNode(true));
      actions.appendChild(purgeBtn);
    } else {
      var toggleClass = 'ca-toggle ' + (a.active ? 'active' : '');
      var toggle = $create('div', { className: toggleClass, 'data-action': 'toggle-anchor', 'data-id': a.id });
      actions.appendChild(toggle);
    }

    li.appendChild(content);
    li.appendChild(actions);

    return li;
  }

  function buildEmptyState(message) {
    var $create = window.__ca.shared.$create;
    message = message || 'No anchors yet.\nHighlight text to create one.';

    var div = $create('div', { className: 'ca-empty-state' });

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z');
    svg.appendChild(path);

    var p = $create('p', { textContent: message });

    div.appendChild(svg);
    div.appendChild(p);

    return div;
  }

  function updateBundleList() {
    var list = window.__ca.shared.$id('ca-bundle-list');
    if (!list) return;

    var bundles = currentBundleFilter === 'deleted'
      ? window.__ca.storage.getSoftDeleted('bundles')
      : window.__ca.storage.getBundles();

    if (currentBundleSearch) {
      var term = currentBundleSearch.toLowerCase();
      bundles = bundles.filter(function(b) {
        return b.name.toLowerCase().indexOf(term) !== -1 ||
          (b.description && b.description.toLowerCase().indexOf(term) !== -1) ||
          (b.keyword && b.keyword.toLowerCase().indexOf(term) !== -1);
      });
    }

    if (currentBundleSort === 'newest') {
      bundles.sort(window.__ca.panelMath.compareByCreatedAtDesc);
    } else if (currentBundleSort === 'most-used') {
      bundles.sort(window.__ca.panelMath.compareByUsageCountDesc);
    }

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    if (bundles.length === 0) {
      list.appendChild(buildEmptyState(currentBundleSearch ? 'No bundles match your search.' : 'No bundles yet.\nGroup anchors to toggle them as a set.'));
      return;
    }

    for (var i = 0; i < bundles.length; i++) {
      list.appendChild(buildBundleItem(bundles[i]));
    }
  }

  function buildBundleItem(bun) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var totalCount = bun.anchorIds.length;
    var activeCount = 0;
    for (var ai = 0; ai < bun.anchorIds.length; ai++) {
      var a = window.__ca.storage.getById(bun.anchorIds[ai]);
      if (a && window.__ca.panelMath.isActiveAnchor(a)) activeCount++;
    }

    var isActive = window.__ca.storage.getActiveBundleId() === bun.id;

    var li = $create('li', { className: 'ca-bundle-item' + (isActive ? ' active' : '') + (bun.deleted ? ' deleted' : ''), 'data-id': bun.id });

    if (_bulkState().enabled) {
      var bunCb = $create('div', {
        className: 'ca-bulk-checkbox' + (_bulkState().selectedIds.indexOf(bun.id) !== -1 ? ' checked' : ''),
        'data-action': 'bulk-select',
        'data-id': bun.id
      });
      li.appendChild(bunCb);
    }

    var content = $create('div', { className: 'ca-bundle-content' });

    var nameH3 = $create('h3', { className: 'ca-bundle-name', textContent: esc(bun.name) });
    content.appendChild(nameH3);

    if (bun.description) {
      var descP = $create('p', { className: 'ca-bundle-desc', textContent: esc(bun.description), 'data-action': 'expand-text', 'data-id': bun.id });
      content.appendChild(descP);
    }

    var infoP = $create('p', { className: 'ca-bundle-info', textContent: activeCount + ' active / ' + totalCount + ' anchors' });
    content.appendChild(infoP);

    var allKeywords = {};
    for (var ai = 0; ai < bun.anchorIds.length; ai++) {
      var a = window.__ca.storage.getById(bun.anchorIds[ai]);
      if (a && a.triggerKeywords) {
        for (var ki = 0; ki < a.triggerKeywords.length; ki++) {
          allKeywords[a.triggerKeywords[ki]] = true;
        }
      }
    }
    var uniqueKeywords = Object.keys(allKeywords);
    if (uniqueKeywords.length > 0) {
      var keywordRow = $create('div', { className: 'ca-bundle-keywords' });
      for (var ki = 0; ki < uniqueKeywords.length; ki++) {
        var chip = $create('span', { className: 'ca-bundle-keyword-chip', textContent: uniqueKeywords[ki] });
        keywordRow.appendChild(chip);
      }
      content.appendChild(keywordRow);
    }

    var footer = $create('div', { className: 'ca-bundle-footer' });

    var footerInfo = $create('div', { className: 'ca-bundle-footer-info' });
    if (bun.usageCount && bun.usageCount > 0) {
      var usageSpan = $create('span', { className: 'ca-anchor-usage', textContent: esc(bun.usageCount) + ' activations' });
      footerInfo.appendChild(usageSpan);
    }
    var dateSpan = $create('span', { className: 'ca-anchor-usage', textContent: esc(new Date(bun.createdAt).toLocaleDateString()) });
    footerInfo.appendChild(dateSpan);
    footer.appendChild(footerInfo);

    var footerActions = $create('div', { className: 'ca-bundle-footer-actions' });

    var editBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'edit-bundle', 'data-id': bun.id, 'aria-label': 'Edit bundle' });
    editBtn.appendChild(ICON_EDIT.cloneNode(true));
    footerActions.appendChild(editBtn);

    var exportBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'export-bundle', 'data-id': bun.id, 'aria-label': 'Export bundle', title: 'Export' });
    exportBtn.appendChild(ICON_EXPORT.cloneNode(true));
    footerActions.appendChild(exportBtn);

    var deleteBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'delete-bundle', 'data-id': bun.id, 'aria-label': 'Delete bundle' });
    deleteBtn.appendChild(ICON_DELETE.cloneNode(true));
    footerActions.appendChild(deleteBtn);

    var injectAllBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'inject-all-bundle', 'data-id': bun.id, 'aria-label': 'Inject all bundle anchors', title: 'Inject All' });
    injectAllBtn.appendChild(ICON_INJECT_ALL.cloneNode(true));
    footerActions.appendChild(injectAllBtn);

    footer.appendChild(footerActions);
    content.appendChild(footer);

    var actions = $create('div', { className: 'ca-bundle-actions' });

    if (bun.deleted) {
      var bunDeletedLabel = $create('span', { className: 'ca-anchor-usage', textContent: 'Deleted ' + esc(getRelativeTime(bun.deletedAt || bun.createdAt)) });
      actions.appendChild(bunDeletedLabel);
      var bunRestoreBtn = $create('button', { className: 'ca-btn-activate', 'data-action': 'restore-bundle', 'data-id': bun.id, textContent: 'Restore' });
      actions.appendChild(bunRestoreBtn);
      var bunPurgeBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'purge-bundle', 'data-id': bun.id, 'aria-label': 'Delete permanently' });
      bunPurgeBtn.appendChild(ICON_DELETE.cloneNode(true));
      actions.appendChild(bunPurgeBtn);
    } else {
      var toggleBtn = $create('button', { className: 'ca-btn-activate' + (isActive ? ' active' : ''), 'data-action': 'toggle-bundle', 'data-id': bun.id, textContent: isActive ? 'Active' : 'Activate' });
      actions.appendChild(toggleBtn);
    }

    li.appendChild(content);
    li.appendChild(actions);
    return li;
  }

  function updateConstraintList() {
    var list = window.__ca.shared.$id('ca-constraint-list');
    if (!list) return;

    if (typeof window.__ca.storage.getAllConstraints !== 'function' && typeof window.__ca.storage.getSoftDeleted !== 'function') return;

    var constraints = currentConstraintFilter === 'deleted'
      ? window.__ca.storage.getSoftDeleted('constraints')
      : window.__ca.storage.getAllConstraints();

    constraints = window.__ca.panelMath.applySearchFilter(constraints, currentConstraintSearch);

    if (currentConstraintFilter === 'active') {
      constraints = constraints.filter(function(c) { return c.active; });
    } else if (currentConstraintFilter === 'inactive') {
      constraints = constraints.filter(function(c) { return !c.active; });
    }

    if (currentConstraintSort === 'priority') {
      constraints.sort(function(a, b) {
        if (a.priority === b.priority) return window.__ca.panelMath.compareByCreatedAtDesc(a, b);
        return a.priority === 'high' ? -1 : 1;
      });
    } else {
      constraints.sort(window.__ca.panelMath.compareByCreatedAtDesc);
    }

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    if (constraints.length === 0) {
      var emptyMsg;
      if (currentConstraintFilter === 'deleted') {
        emptyMsg = currentConstraintSearch ? 'No deleted constraints match your search.' : 'Trash is empty.';
      } else {
        emptyMsg = currentConstraintSearch ? 'No constraints match your search.' : 'No constraints yet.\nClick "+ New Constraint" to add one.';
      }
      list.appendChild(buildEmptyState(emptyMsg));
      return;
    }

    for (var i = 0; i < constraints.length; i++) {
      list.appendChild(buildConstraintItem(constraints[i]));
    }
  }

  function buildConstraintItem(c) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var li = $create('li', { className: 'ca-constraint-item' + (c.active ? '' : ' inactive'), 'data-id': c.id });

    if (_bulkState().enabled) {
      var cb = $create('div', {
        className: 'ca-bulk-checkbox' + (_bulkState().selectedIds.indexOf(c.id) !== -1 ? ' checked' : ''),
        'data-action': 'bulk-select',
        'data-id': c.id
      });
      li.appendChild(cb);
    }

    var content = $create('div', { className: 'ca-constraint-content' });

    var nameEl = $create('p', { className: 'ca-constraint-name', textContent: esc(c.name) });
    content.appendChild(nameEl);

    var textEl = $create('p', { className: 'ca-constraint-text', textContent: esc(c.text) });
    content.appendChild(textEl);

    var footer = $create('div', { className: 'ca-constraint-footer' });
    var footerInfo = $create('div', { className: 'ca-constraint-footer-info' });

    var priorityClass = 'ca-constraint-priority ca-constraint-priority-' + (c.priority === 'high' ? 'high' : 'low');
    var priorityEl = $create('span', { className: priorityClass, textContent: esc(c.priority) });
    footerInfo.appendChild(priorityEl);

    var statusText = c.active ? 'Active' : 'Inactive';
    var statusEl = $create('span', { className: 'ca-anchor-usage', textContent: esc(statusText) });
    footerInfo.appendChild(statusEl);

    footer.appendChild(footerInfo);

    var actions = $create('div', { className: 'ca-constraint-footer-actions' });

    if (c.deleted) {
      var delLabel = $create('span', { className: 'ca-anchor-usage', textContent: 'Deleted ' + esc(getRelativeTime(c.deletedAt || c.createdAt)) });
      actions.appendChild(delLabel);
      var restoreBtn = $create('button', { className: 'ca-btn-activate', 'data-action': 'restore-constraint', 'data-id': c.id, textContent: 'Restore' });
      actions.appendChild(restoreBtn);
      var purgeBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'purge-constraint', 'data-id': c.id, 'aria-label': 'Delete permanently' });
      purgeBtn.appendChild(ICON_DELETE.cloneNode(true));
      actions.appendChild(purgeBtn);
    } else {
      var editBtn = $create('button', { className: 'ca-btn-edit', 'data-action': 'edit-constraint', 'data-id': c.id, 'aria-label': 'Edit constraint' });
      editBtn.appendChild(ICON_EDIT.cloneNode(true));
      actions.appendChild(editBtn);

      var deleteBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'delete-constraint', 'data-id': c.id, 'aria-label': 'Delete constraint' });
      deleteBtn.appendChild(ICON_DELETE.cloneNode(true));
      actions.appendChild(deleteBtn);

      var pinBtn = $create('button', { className: 'ca-btn-pin' + (c.active ? ' active' : ''), 'data-action': 'pin-constraint', 'data-id': c.id, 'aria-label': c.active ? 'Deactivate constraint' : 'Activate constraint' });
      pinBtn.appendChild(ICON_PIN.cloneNode(true));
      actions.appendChild(pinBtn);
    }

    footer.appendChild(actions);
    content.appendChild(footer);
    li.appendChild(content);
    return li;
  }

  function renderConstraintEditor(data) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var existing = window.__ca.shared.$id('ca-constraint-editor');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var isEdit = data && data.id;
    var overlay = $create('div', { id: 'ca-constraint-editor', className: 'ca-constraint-editor-overlay' });

    var dialog = $create('div', { className: 'ca-constraint-editor-dialog' });

    var title = $create('h3', { className: 'ca-constraint-editor-title', textContent: isEdit ? 'Edit Constraint' : 'New Constraint' });
    dialog.appendChild(title);

    var nameField = $create('div', { className: 'ca-constraint-editor-field' });
    var nameLabel = $create('label', { className: 'ca-constraint-editor-label', textContent: 'Name' });
    nameField.appendChild(nameLabel);
    var nameInput = $create('input', { id: 'ca-constraint-editor-name', className: 'ca-constraint-editor-input', type: 'text', value: isEdit ? escAttr(data.name) : '', placeholder: 'Constraint name...' });
    nameField.appendChild(nameInput);
    dialog.appendChild(nameField);

    var textField = $create('div', { className: 'ca-constraint-editor-field' });
    var textLabel = $create('label', { className: 'ca-constraint-editor-label', textContent: 'Constraint Text' });
    textField.appendChild(textLabel);
    var textInput = $create('textarea', { id: 'ca-constraint-editor-text', className: 'ca-constraint-editor-textarea', placeholder: 'e.g. Be concise. Use bullet points.' });
    if (isEdit) textInput.value = data.text;
    textField.appendChild(textInput);
    dialog.appendChild(textField);

    var priorityField = $create('div', { className: 'ca-constraint-editor-field' });
    var priorityLabel = $create('label', { className: 'ca-constraint-editor-label', textContent: 'Priority' });
    priorityField.appendChild(priorityLabel);
    var prioritySelect = $create('select', { id: 'ca-constraint-editor-priority', className: 'ca-constraint-editor-select' });
    var lowOpt = $create('option', { value: 'low', textContent: 'Low' });
    var highOpt = $create('option', { value: 'high', textContent: 'High' });
    if (isEdit && data.priority === 'high') highOpt.setAttribute('selected', '');
    else lowOpt.setAttribute('selected', '');
    prioritySelect.appendChild(lowOpt);
    prioritySelect.appendChild(highOpt);
    priorityField.appendChild(prioritySelect);
    dialog.appendChild(priorityField);

    var actions = $create('div', { className: 'ca-constraint-editor-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'cancel-constraint-editor', textContent: 'Cancel' });
    var saveBtn = $create('button', { className: 'ca-btn-save', 'data-action': 'save-constraint', textContent: isEdit ? 'Save' : 'Create' });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    if (window.__ca.license.isFeatureEnabled('save-and-new')) {
      var saveNewBtn = $create('button', { className: 'ca-btn-save', 'data-action': 'save-constraint-and-new', textContent: 'Save & New' });
      actions.appendChild(saveNewBtn);
    }
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.dataset.action === 'cancel-constraint-editor') {
        removeConstraintEditor();
      } else if (target.dataset.action === 'save-constraint') {
        var name = nameInput.value.trim();
        var text = textInput.value.trim();
        var priority = prioritySelect.value;
        if (!name || !text) return;
        if (isEdit) {
          window.__ca.storage.updateConstraint(data.id, { name: name, text: text, priority: priority });
        } else {
          window.__ca.storage.createConstraint(name, text, priority);
        }
        window.__ca.events.emit('constraints:changed');
        removeConstraintEditor();
      } else if (target.dataset.action === 'save-constraint-and-new') {
        var csName = nameInput.value.trim();
        var csText = textInput.value.trim();
        var csPriority = prioritySelect.value;
        if (!csName || !csText) return;
        if (isEdit) {
          window.__ca.storage.updateConstraint(data.id, { name: csName, text: csText, priority: csPriority });
        } else {
          window.__ca.storage.createConstraint(csName, csText, csPriority);
        }
        window.__ca.events.emit('constraints:changed');
        renderConstraintEditor(null);
      }
    });

    setTimeout(function() { nameInput.focus(); }, 50);
  }

  function removeConstraintEditor() {
    var el = window.__ca.shared.$id('ca-constraint-editor');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function renderBundleCreator(bun) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var existing = window.__ca.shared.$id('ca-bundle-creator');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var overlay = $create('div', { id: 'ca-bundle-creator', className: 'ca-bundle-creator-overlay' });

    var dialog = $create('div', { className: 'ca-bundle-creator-dialog' });

    var title = $create('h3', { className: 'ca-bundle-creator-title', textContent: bun ? 'Edit Bundle' : 'New Bundle' });
    dialog.appendChild(title);

    var nameInput = $create('input', { id: 'ca-bundle-creator-name', className: 'ca-bundle-creator-name', type: 'text', value: bun ? escAttr(bun.name) : '', placeholder: 'Bundle name...' });
    dialog.appendChild(nameInput);

    var descInput = $create('input', { id: 'ca-bundle-creator-desc', className: 'ca-bundle-creator-name', type: 'text', value: bun ? escAttr(bun.description || '') : '', placeholder: 'Short description...' });
    dialog.appendChild(descInput);

    var prefillKw = bun ? (bun.keyword || '') : '';

    var keywordInput = $create('input', { id: 'ca-bundle-creator-keyword', className: 'ca-bundle-creator-name', type: 'text', value: escAttr(prefillKw), placeholder: 'Trigger keyword (applied to all selected)...' });
    dialog.appendChild(keywordInput);

    var anchors = window.__ca.storage.getAll();
    if (anchors.length > 0) {
      var listContainer = $create('div', { className: 'ca-bundle-creator-list' });
      for (var i = 0; i < anchors.length; i++) {
        var row = $create('label', { className: 'ca-bundle-creator-item' });
        var cb = $create('input', { type: 'checkbox', value: anchors[i].id });
        if (bun && bun.anchorIds.indexOf(anchors[i].id) !== -1) cb.setAttribute('checked', '');
        row.appendChild(cb);
        var textSpan = $create('span', { className: 'ca-bundle-creator-text', textContent: esc(anchors[i].text.substring(0, 60)) });
        row.appendChild(textSpan);
        listContainer.appendChild(row);
      }
      dialog.appendChild(listContainer);
    } else {
      var emptyMsg = $create('p', { className: 'ca-bundle-creator-empty', textContent: 'No anchors yet. Create anchors first.' });
      dialog.appendChild(emptyMsg);
    }

    var actions = $create('div', { className: 'ca-bundle-creator-actions' });
    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'cancel-bundle-creator', textContent: 'Cancel' });
    var createBtn = $create('button', { className: 'ca-btn-danger', 'data-action': 'create-bundle', textContent: bun ? 'Save' : 'Create' });
    actions.appendChild(cancelBtn);
    actions.appendChild(createBtn);
    if (window.__ca.license.isFeatureEnabled('save-and-new')) {
      var saveNewBtn = $create('button', { className: 'ca-btn-save', 'data-action': 'save-bundle-and-new', textContent: 'Save & New' });
      actions.appendChild(saveNewBtn);
    }
    dialog.appendChild(actions);

    overlay.appendChild(dialog);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      if (target.dataset.action === 'cancel-bundle-creator') {
        removeBundleCreator();
      } else if (target.dataset.action === 'create-bundle') {
        var name = nameInput.value.trim();
        if (!name) return;
        var desc = descInput.value.trim().substring(0, 80);
        var checkedBoxes = overlay.querySelectorAll('input[type="checkbox"]:checked');
        var newAnchorIds = [];
        for (var ci = 0; ci < checkedBoxes.length; ci++) {
          newAnchorIds.push(checkedBoxes[ci].value);
        }

        if (bun) {
          var oldKeyword = bun.keyword || '';
          var kw = keywordInput.value.trim().toLowerCase();
          if (kw !== oldKeyword) {
            if (oldKeyword) {
              for (var j = 0; j < bun.anchorIds.length; j++) {
                window.__ca.storage.removeTriggerKeyword(bun.anchorIds[j], oldKeyword);
              }
            }
            if (kw) {
              for (var ci = 0; ci < newAnchorIds.length; ci++) {
                window.__ca.storage.addTriggerKeyword(newAnchorIds[ci], kw);
              }
            }
          }
          window.__ca.storage.updateBundle(bun.id, { name: name, description: desc, keyword: kw, anchorIds: newAnchorIds });
          if (window.__ca.storage.getActiveBundleId() === bun.id) {
            window.__ca.storage.activateBundleExclusively(bun.id);
          }
        } else {
          var kw = keywordInput.value.trim().toLowerCase();
          var newBundle = window.__ca.storage.createBundle(name, newAnchorIds, kw);
          if (desc) window.__ca.storage.updateBundle(newBundle.id, { description: desc });
          if (kw && newAnchorIds.length > 0) {
            for (var ci = 0; ci < newAnchorIds.length; ci++) {
              window.__ca.storage.addTriggerKeyword(newAnchorIds[ci], kw);
            }
          }
        }
        removeBundleCreator();
        updateBundleList();
      } else if (target.dataset.action === 'save-bundle-and-new') {
        var saveName = nameInput.value.trim();
        if (!saveName) return;
        var saveDesc = descInput.value.trim().substring(0, 80);
        var saveBoxes = overlay.querySelectorAll('input[type="checkbox"]:checked');
        var saveIds = [];
        for (var sci = 0; sci < saveBoxes.length; sci++) {
          saveIds.push(saveBoxes[sci].value);
        }
        if (bun) {
          var oldKw = bun.keyword || '';
          var newKw = keywordInput.value.trim().toLowerCase();
          if (newKw !== oldKw) {
            if (oldKw) {
              for (var j = 0; j < bun.anchorIds.length; j++) {
                window.__ca.storage.removeTriggerKeyword(bun.anchorIds[j], oldKw);
              }
            }
            if (newKw) {
              for (var sci = 0; sci < saveIds.length; sci++) {
                window.__ca.storage.addTriggerKeyword(saveIds[sci], newKw);
              }
            }
          }
          window.__ca.storage.updateBundle(bun.id, { name: saveName, description: saveDesc, keyword: newKw, anchorIds: saveIds });
          if (window.__ca.storage.getActiveBundleId() === bun.id) {
            window.__ca.storage.activateBundleExclusively(bun.id);
          }
        } else {
          var newKw = keywordInput.value.trim().toLowerCase();
          var newBundle = window.__ca.storage.createBundle(saveName, saveIds, newKw);
          if (saveDesc) window.__ca.storage.updateBundle(newBundle.id, { description: saveDesc });
          if (newKw && saveIds.length > 0) {
            for (var sci = 0; sci < saveIds.length; sci++) {
              window.__ca.storage.addTriggerKeyword(saveIds[sci], newKw);
            }
          }
        }
        updateBundleList();
        renderBundleCreator();
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') removeBundleCreator();
    });

    nameInput.focus();
  }

  function removeBundleCreator() {
    var overlay = window.__ca.shared.$id('ca-bundle-creator');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function buildTemplateItem(tpl) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var isTplActive = tpl.active !== false;
    var li = $create('li', { className: 'ca-template-item' + (tpl.deleted ? ' deleted' : '') + (isTplActive ? '' : ' inactive'), 'data-id': tpl.id });

    if (_bulkState().enabled) {
      var tplCb = $create('div', {
        className: 'ca-bulk-checkbox' + (_bulkState().selectedIds.indexOf(tpl.id) !== -1 ? ' checked' : ''),
        'data-action': 'bulk-select',
        'data-id': tpl.id
      });
      li.appendChild(tplCb);
    }

    var content = $create('div', { className: 'ca-template-content' });

    var nameH3 = $create('h3', { className: 'ca-tpl-name', textContent: esc(tpl.name) });
    content.appendChild(nameH3);

    if (tpl.description) {
      var tplDescEl = $create('p', {
        className: 'ca-tpl-desc',
        textContent: esc(tpl.description),
        'data-action': 'expand-text',
        'data-id': tpl.id
      });
      content.appendChild(tplDescEl);
    }

    var textP = $create('p', { className: 'ca-tpl-text', textContent: esc(tpl.text), 'data-action': 'expand-text', 'data-id': tpl.id });
    content.appendChild(textP);

    var footer = $create('div', { className: 'ca-template-footer' });

    var footerInfo = $create('div', { className: 'ca-template-footer-info' });
    if (tpl.usageCount && tpl.usageCount > 0) {
      var usageSpan = $create('span', { className: 'ca-anchor-usage', textContent: esc(tpl.usageCount) + ' activations' });
      footerInfo.appendChild(usageSpan);
    }
    if (tpl.tags && tpl.tags.length > 0) {
      for (var tgi = 0; tgi < tpl.tags.length; tgi++) {
        var tagSpan = $create('span', { className: 'ca-tag', 'data-action': 'filter-tag', 'data-tag': escAttr(tpl.tags[tgi]), textContent: '#' + esc(tpl.tags[tgi]) });
        footerInfo.appendChild(tagSpan);
      }
    }
    if (tpl.triggerKeywords && tpl.triggerKeywords.length > 0) {
      for (var tki = 0; tki < tpl.triggerKeywords.length; tki++) {
        var kwChip = $create('span', { className: 'ca-trigger-chip', textContent: esc(tpl.triggerKeywords[tki]) });
        footerInfo.appendChild(kwChip);
      }
    }
    if (tpl.ttlMinutes !== null && tpl.ttlExpiresAt !== null) {
      var ttlRemaining = tpl.ttlExpiresAt - Date.now();
      if (ttlRemaining > 0) {
        var remainingMins = Math.ceil(ttlRemaining / 60000);
        var ttlClass = 'ca-ttl-pill' + (remainingMins < 60 ? ' warning' : '');
        var ttlText = window.__ca.shared.formatTTL(remainingMins);
        var ttlPill = $create('span', { className: ttlClass });
        var ttlIcon = ICON_TTL.cloneNode(true);
        ttlIcon.setAttribute('class', 'ca-ttl-icon');
        ttlPill.appendChild(ttlIcon);
        ttlPill.appendChild(document.createTextNode(' ' + ttlText));
        footerInfo.appendChild(ttlPill);
      }
    }
    footer.appendChild(footerInfo);

    var footerActions = $create('div', { className: 'ca-template-footer-actions' });

    var editBtn = $create('button', { className: 'ca-btn-edit', 'data-action': 'edit-template', 'data-id': tpl.id, 'aria-label': 'Edit template' });
    editBtn.appendChild(ICON_EDIT.cloneNode(true));
    footerActions.appendChild(editBtn);

    var copyBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'copy-template', 'data-id': tpl.id, 'aria-label': 'Copy template', title: 'Copy' });
    copyBtn.appendChild(ICON_COPY.cloneNode(true));
    footerActions.appendChild(copyBtn);

    var injectBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'inject-template', 'data-id': tpl.id, 'aria-label': 'Inject template', title: 'Inject' });
    injectBtn.appendChild(ICON_INJECT.cloneNode(true));
    footerActions.appendChild(injectBtn);

    var exportBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'export-template', 'data-id': tpl.id, 'aria-label': 'Export template', title: 'Export' });
    exportBtn.appendChild(ICON_EXPORT.cloneNode(true));
    footerActions.appendChild(exportBtn);

    var deleteBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'delete-template', 'data-id': tpl.id, 'aria-label': 'Delete template' });
    deleteBtn.appendChild(ICON_DELETE.cloneNode(true));
    footerActions.appendChild(deleteBtn);

    footer.appendChild(footerActions);
    content.appendChild(footer);

    var actions = $create('div', { className: 'ca-template-actions' });

    if (tpl.deleted) {
      var tplDeletedLabel = $create('span', { className: 'ca-anchor-usage', textContent: 'Deleted ' + esc(getRelativeTime(tpl.deletedAt || tpl.createdAt)) });
      actions.appendChild(tplDeletedLabel);
      var tplRestoreBtn = $create('button', { className: 'ca-btn-activate', 'data-action': 'restore-template', 'data-id': tpl.id, textContent: 'Restore' });
      actions.appendChild(tplRestoreBtn);
      var tplPurgeBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'purge-template', 'data-id': tpl.id, 'aria-label': 'Delete permanently' });
      tplPurgeBtn.appendChild(ICON_DELETE.cloneNode(true));
      actions.appendChild(tplPurgeBtn);
    } else {
      var toggleTplClass = 'ca-toggle ' + (isTplActive ? 'active' : '');
      var toggleTpl = $create('div', { className: toggleTplClass, 'data-action': 'toggle-template-active', 'data-id': tpl.id });
      var activateBtn = $create('button', { className: 'ca-btn-activate', 'data-action': 'activate-template', 'data-id': tpl.id, textContent: 'Activate' });
      actions.appendChild(activateBtn);
      actions.appendChild(toggleTpl);
    }

    li.appendChild(content);
    li.appendChild(actions);

    return li;
  }

  function renderTagStats() {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;
    var tags = window.__ca.storage.getTags();
    if (tags.length === 0) return null;

    var container = $create('div', { className: 'ca-tag-stats' });
    for (var i = 0; i < tags.length; i++) {
      var count = window.__ca.storage.getAnchorsByTag(tags[i]).length;
      var chip = $create('span', {
        className: 'ca-tag-stat' + (currentSearch === '#' + tags[i] ? ' active' : ''),
        'data-action': 'filter-tag',
        'data-tag': escAttr(tags[i]),
        textContent: '#' + esc(tags[i]) + ' (' + count + ')'
      });
      var renameBtn = $create('button', {
        className: 'ca-tag-rename-btn',
        'data-action': 'rename-tag',
        'data-tag': escAttr(tags[i]),
        textContent: '✎',
        title: 'Rename "' + esc(tags[i]) + '"'
      });
      chip.appendChild(renameBtn);
      container.appendChild(chip);
    }
    return container;
  }

  function renderPanelGroup(list, label, anchors) {
    if (!anchors || anchors.length === 0) return;
    var $create = window.__ca.shared.$create;

    var isCollapsed = collapsedPanelGroups[label] === true;
    var hdr = $create('div', {
      className: 'ca-panel-group-hdr',
      'data-action': 'toggle-panel-group',
      'data-group': label,
      textContent: '#' + label + ' (' + anchors.length + ')' + (isCollapsed ? ' ▸' : ' ▾')
    });
    list.appendChild(hdr);

    if (isCollapsed) return;

    for (var i = 0; i < anchors.length; i++) {
      list.appendChild(buildAnchorItem(anchors[i]));
    }
  }

  function renderTemplateGroup(list, label, templates) {
    if (!templates || templates.length === 0) return;
    var $create = window.__ca.shared.$create;

    var isCollapsed = collapsedTemplateGroups[label] === true;
    var hdr = $create('div', {
      className: 'ca-panel-group-hdr',
      'data-action': 'toggle-template-group',
      'data-group': label,
      textContent: '#' + label + ' (' + templates.length + ')' + (isCollapsed ? ' ▸' : ' ▾')
    });
    list.appendChild(hdr);

    if (isCollapsed) return;

    for (var i = 0; i < templates.length; i++) {
      list.appendChild(buildTemplateItem(templates[i]));
    }
  }

  function updateAnchorList() {
    var list = window.__ca.shared.$id('ca-anchor-list');
    if (!list) return;

    var anchors = getFilteredAnchors();

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    var tagStats = renderTagStats();
    if (tagStats) list.appendChild(tagStats);

    if (anchors.length === 0) {
      var emptyMsg;
      if (currentSearch) {
        emptyMsg = 'No anchors match "' + currentSearch + '".';
      } else if (currentFilter !== 'all') {
        emptyMsg = 'No ' + currentFilter + ' anchors.';
      } else {
        emptyMsg = 'No anchors yet.\nHighlight text to create one.';
      }
      list.appendChild(buildEmptyState(emptyMsg));
      return;
    }

    if (currentPanelGroup === 'tag') {
      var groups = window.__ca.panelMath.groupByTag(anchors);
      var tagKeys = Object.keys(groups).sort(window.__ca.panelMath.compareTagKeyUntaggedLast);
      for (var gi = 0; gi < tagKeys.length; gi++) {
        renderPanelGroup(list, tagKeys[gi], groups[tagKeys[gi]]);
      }
    } else {
      for (var i = 0; i < anchors.length; i++) {
        list.appendChild(buildAnchorItem(anchors[i]));
      }
    }
  }

  function updateTemplateList() {
    var list = window.__ca.shared.$id('ca-template-list');
    if (!list) return;

    var templates = currentTemplateFilter === 'deleted'
      ? window.__ca.storage.getSoftDeleted('templates')
      : window.__ca.storage.getTemplates();

    if (currentTemplateSearch) {
      var term = currentTemplateSearch.toLowerCase();
      templates = templates.filter(function(t) {
        return t.name.toLowerCase().indexOf(term) !== -1 ||
          (t.text && t.text.toLowerCase().indexOf(term) !== -1) ||
          (t.tags && t.tags.some(function(tg) { return tg.toLowerCase().indexOf(term) !== -1; }));
      });
    }

    if (currentTemplateSort === 'newest') {
      templates.sort(window.__ca.panelMath.compareByCreatedAtDesc);
    } else if (currentTemplateSort === 'most-used') {
      templates.sort(window.__ca.panelMath.compareByUsageCountDesc);
    }

    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }

    var tagStats = renderTagStats();
    if (tagStats) list.appendChild(tagStats);

    if (templates.length === 0) {
      list.appendChild(buildEmptyState(currentTemplateSearch ? 'No templates match your search.' : 'No templates yet.\nClick "+ New Template" to create one.'));
      return;
    }

    if (currentTemplateGroup === 'tag') {
      var groups = window.__ca.panelMath.groupByTag(templates);
      var tagKeys = Object.keys(groups).sort(window.__ca.panelMath.compareTagKeyUntaggedLast);
      for (var gi = 0; gi < tagKeys.length; gi++) {
        renderTemplateGroup(list, tagKeys[gi], groups[tagKeys[gi]]);
      }
    } else {
      for (var i = 0; i < templates.length; i++) {
        list.appendChild(buildTemplateItem(templates[i]));
      }
    }
  }

  function getCurrentFilteredItems() {
    if (currentTab === 'anchors') {
      return getFilteredAnchors();
    } else if (currentTab === 'templates') {
      var tpls = window.__ca.storage.getTemplates();
      if (currentTemplateFilter === 'deleted') {
        tpls = window.__ca.storage.getSoftDeleted('templates');
      }
      return window.__ca.panelMath.applySearchFilter(tpls, currentTemplateSearch);
    } else if (currentTab === 'bundles') {
      var buns = window.__ca.storage.getBundles();
      if (currentBundleFilter === 'deleted') {
        buns = window.__ca.storage.getSoftDeleted('bundles');
      }
      return window.__ca.panelMath.applySearchFilter(buns, currentBundleSearch);
    } else if (currentTab === 'constraints') {
      var cons = currentConstraintFilter === 'deleted'
        ? window.__ca.storage.getSoftDeleted('constraints')
        : window.__ca.storage.getAllConstraints();
      if (currentConstraintFilter === 'active') {
        cons = cons.filter(function(c) { return c.active; });
      } else if (currentConstraintFilter === 'inactive') {
        cons = cons.filter(function(c) { return !c.active; });
      }
      return window.__ca.panelMath.applySearchFilter(cons, currentConstraintSearch);
    }
    return [];
  }

  function updateCurrentList() {
    if (currentTab === 'anchors') updateAnchorList();
    else if (currentTab === 'templates') updateTemplateList();
    else if (currentTab === 'bundles') updateBundleList();
    else if (currentTab === 'constraints') updateConstraintList();
  }

  function updateBulkBar() {
    var ids = ['ca-bulk-bar', 'ca-bulk-bar-templates', 'ca-bulk-bar-bundles', 'ca-bulk-bar-constraints'];
    var tabs = ['anchors', 'templates', 'bundles', 'constraints'];
    var filters = [currentFilter, currentTemplateFilter, currentBundleFilter, currentConstraintFilter];
    var restoreActions = ['bulk-restore', 'bulk-restore-templates', 'bulk-restore-bundles', 'bulk-restore-constraints'];
    for (var i = 0; i < ids.length; i++) {
      var bar = window.__ca.shared.$id(ids[i]);
      if (!bar) continue;
      var countEl = bar.querySelector('.ca-bulk-count');
      if (countEl) countEl.textContent = _bulkState().selectedIds.length + ' selected';
      var show = _bulkState().enabled && _bulkState().selectedIds.length > 0 && currentTab === tabs[i];
      bar.className = 'ca-bulk-bar' + (show ? '' : ' hidden');
      var restoreBtn = bar.querySelector('[data-action="' + restoreActions[i] + '"]');
      if (restoreBtn) restoreBtn.style.display = (show && filters[i] === 'deleted') ? '' : 'none';
    }
  }

  function toggleBulk() {
    _bulkState().enabled = !_bulkState().enabled;
    _bulkState().selectedIds = [];
    if (currentTab === 'anchors') updateAnchorList();
    else if (currentTab === 'templates') updateTemplateList();
    else if (currentTab === 'bundles') updateBundleList();
    else if (currentTab === 'constraints') updateConstraintList();
    updateBulkBar();
    var btn = window.__ca.shared.$one('[data-action="toggle-bulk"]');
    if (btn) btn.className = 'ca-btn-icon ca-btn-bulk' + (_bulkState().enabled ? ' active' : '');
  }

  function switchTab(tabName) {
    _bulkState().selectedIds = [];
    currentTab = tabName;
    var constraintBtn = window.__ca.shared.$one('.ca-status-constraints');
    if (constraintBtn) constraintBtn.classList.toggle('active', tabName === 'constraints');
    var panel = window.__ca.shared.$id('ca-panel');
    if (!panel) return;

    var tabs = panel.querySelectorAll('.ca-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = 'ca-tab' + (tabs[i].dataset.tab === tabName ? ' active' : '');
    }

    var contents = panel.querySelectorAll('.ca-tab-content');
    for (var j = 0; j < contents.length; j++) {
      contents[j].className = 'ca-tab-content' + (contents[j].id === 'ca-tab-' + tabName ? ' active' : '');
    }

    if (tabName === 'anchors') {
      updateAnchorList();
    } else if (tabName === 'templates') {
      updateTemplateList();
    } else if (tabName === 'bundles') {
      updateBundleList();
    } else if (tabName === 'constraints') {
      try { updateConstraintList(); } catch (e) { console.error('[CA] updateConstraintList:', e.message || e, e.stack); }
    }
    updateBulkBar();
    var tabBar = panel.querySelector('.ca-tabs');
    var activeTab = tabBar.querySelector('.ca-tab.active');
    if (activeTab) tabBar.scrollLeft = activeTab.offsetLeft - tabBar.offsetLeft;
  }

  function renderEditorOverlay(editorType, data) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    var overlay = $create('div', { id: 'ca-editor-overlay', className: 'ca-editor-overlay' });
    overlay._editorType = editorType;
    overlay._editorData = data;

    var panel = $create('div', { className: 'ca-editor-panel' });

    var header = $create('div', { className: 'ca-editor-header' });
    var title = $create('h2', { className: 'ca-editor-title', textContent: editorType === 'anchor' ? 'Edit Anchor' : 'Edit Template' });
    header.appendChild(title);

    var closeBtn = $create('button', { className: 'ca-panel-close', 'data-action': 'close-editor', 'aria-label': 'Close editor' });
    closeBtn.appendChild(ICON_CLOSE.cloneNode(true));
    header.appendChild(closeBtn);
    panel.appendChild(header);

    if (editorType === 'template') {
      var nameRow = $create('div', { className: 'ca-editor-name-row' });
      var nameInput = $create('input', { id: 'ca-editor-name', className: 'ca-editor-name', type: 'text', value: escAttr(data.name), placeholder: 'Template name' });
      nameRow.appendChild(nameInput);
      panel.appendChild(nameRow);
    }

    var body = $create('div', { className: 'ca-editor-body' });
    var main = $create('div', { className: 'ca-editor-main' });

    var contentCol = $create('div', { className: 'ca-editor-content' });

    if (editorType === 'anchor') {
      var anchorSection = $create('div', { className: 'ca-editor-section ca-editor-anchor-section' });
      var anchorTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Anchor' });
      anchorSection.appendChild(anchorTitle);
      var allAnchors = window.__ca.storage.getAll();
      var anchorSelect = $create('select', { className: 'ca-editor-anchor-select', 'data-action': 'switch-editor-anchor' });
      var placeholderOpt = $create('option', { value: '', textContent: 'Switch anchor...', disabled: '' });
      anchorSelect.appendChild(placeholderOpt);
      for (var ai = 0; ai < allAnchors.length; ai++) {
        var label = allAnchors[ai].text.substring(0, 72);
        if (allAnchors[ai].text.length > 72) label += '\u2026';
        var opt = $create('option', { value: allAnchors[ai].id, textContent: esc(label), title: esc(allAnchors[ai].text) });
        if (allAnchors[ai].id === data.id) opt.setAttribute('selected', '');
        anchorSelect.appendChild(opt);
      }
      anchorSection.appendChild(anchorSelect);
      contentCol.appendChild(anchorSection);
    }

    if (editorType === 'template' && window.__ca.license.isFeatureEnabled('editor-switcher')) {
      var tplSection = $create('div', { className: 'ca-editor-section ca-editor-anchor-section' });
      var tplTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Template' });
      tplSection.appendChild(tplTitle);
      var allTemplates = window.__ca.storage.getTemplates();
      var tplSelect = $create('select', { className: 'ca-editor-anchor-select', 'data-action': 'switch-editor-template' });
      var createNewOpt = $create('option', { value: '__new__', textContent: '+ Create New Template' });
      tplSelect.appendChild(createNewOpt);
      for (var ti = 0; ti < allTemplates.length; ti++) {
        var label = allTemplates[ti].name || allTemplates[ti].text.substring(0, 40);
        if (label.length > 40) label = label.substring(0, 40) + '\u2026';
        var opt = $create('option', { value: allTemplates[ti].id, textContent: esc(label), title: esc(allTemplates[ti].name || allTemplates[ti].text) });
        if (allTemplates[ti].id === data.id) opt.setAttribute('selected', '');
        tplSelect.appendChild(opt);
      }
      tplSection.appendChild(tplSelect);
      contentCol.appendChild(tplSection);
    }

    var descInput = $create('input', {
      id: 'ca-editor-description',
      className: 'ca-editor-description',
      type: 'text',
      value: escAttr(data.description || ''),
      placeholder: 'Add a short description...'
    });
    contentCol.appendChild(descInput);
    var textarea = $create('textarea', { id: 'ca-editor-textarea', className: 'ca-editor-textarea' });
    textarea.value = data.text;
    contentCol.appendChild(textarea);
    main.appendChild(contentCol);

    var sidebar = $create('div', { className: 'ca-editor-sidebar' });

    var sectionTags = $create('div', { id: 'ca-editor-tags', className: 'ca-editor-section' });
    var tagsTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Tags' });
    sectionTags.appendChild(tagsTitle);
    var tagInput = $create('input', { className: 'ca-editor-tag-input', 'data-action': 'add-editor-tag', type: 'text', placeholder: 'Add tag + Enter', 'data-id': data.id, autocomplete: 'off' });
    sectionTags.appendChild(tagInput);
    var tagSuggestions = $create('div', { className: 'ca-tag-suggestions hidden' });
    sectionTags.appendChild(tagSuggestions);
    var tagRow = $create('div', { className: 'ca-editor-tags' });
    if (data.tags && data.tags.length > 0) {
      for (var ti = 0; ti < data.tags.length; ti++) {
        var tChip = $create('span', { className: 'ca-tag', 'data-action': 'remove-editor-tag', 'data-id': data.id, 'data-tag': escAttr(data.tags[ti]), textContent: '#' + esc(data.tags[ti]) });
        tagRow.appendChild(tChip);
      }
    }
    sectionTags.appendChild(tagRow);
    sidebar.appendChild(sectionTags);

    // Trigger Keywords (shared by anchors and templates)
    var sectionTriggers = $create('div', { id: 'ca-editor-triggers', className: 'ca-editor-section' });
    var triggersTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Trigger Keywords' });
    sectionTriggers.appendChild(triggersTitle);
    var triggerHelp = $create('p', { className: 'ca-editor-trigger-help', textContent: 'Only inject when prompt contains these words. Leave empty to always inject.' });
    sectionTriggers.appendChild(triggerHelp);
    var triggerInputEl = $create('input', { className: 'ca-editor-tag-input', 'data-action': 'add-editor-trigger', type: 'text', placeholder: 'Add keyword + Enter', 'data-id': data.id });
    sectionTriggers.appendChild(triggerInputEl);
    var triggerRowEl = $create('div', { className: 'ca-editor-tags' });
    if (data.triggerKeywords && data.triggerKeywords.length > 0) {
      for (var tki = 0; tki < data.triggerKeywords.length; tki++) {
        var tkChip = $create('span', { className: 'ca-tag', 'data-action': 'remove-editor-trigger', 'data-id': data.id, 'data-trigger': escAttr(data.triggerKeywords[tki]), textContent: esc(data.triggerKeywords[tki]) });
        triggerRowEl.appendChild(tkChip);
      }
    }
    sectionTriggers.appendChild(triggerRowEl);
    sidebar.appendChild(sectionTriggers);

    if (editorType === 'anchor') {
      var sectionTurns = $create('div', { id: 'ca-editor-turns', className: 'ca-editor-section' });
      var turnsTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Turns' });
      sectionTurns.appendChild(turnsTitle);

      var turnsDisplay = $create('div', { className: 'ca-editor-turns-display' });
      var turnsText = $create('span', { className: 'ca-editor-turns-text', textContent: esc(data.turnsRemaining) + ' / ' + esc(data.turnsTotal) });
      turnsDisplay.appendChild(turnsText);

      var progress = $create('div', { className: 'ca-editor-progress' });
      var pct = data.turnsTotal > 0 ? (data.turnsRemaining / data.turnsTotal * 100) : 0;
      var fill = $create('div', { className: 'ca-editor-progress-fill' });
      fill.style.width = pct + '%';
      progress.appendChild(fill);
      turnsDisplay.appendChild(progress);
      sectionTurns.appendChild(turnsDisplay);

      var extendRow = $create('div', { className: 'ca-editor-extend-row' });
      var extendValues = [5, 10, 25];
      for (var ev = 0; ev < extendValues.length; ev++) {
        var eBtn = $create('button', { className: 'ca-turn-option', 'data-action': 'extend-editor-turns', 'data-id': data.id, 'data-amount': String(extendValues[ev]), textContent: '+' + extendValues[ev] });
        extendRow.appendChild(eBtn);
      }
      var resetBtn = $create('button', { className: 'ca-turn-option ca-editor-reset-btn', 'data-action': 'reset-editor-turns', 'data-id': data.id, textContent: 'Reset' });
      extendRow.appendChild(resetBtn);
      var customVal = $create('input', { id: 'ca-editor-extend-custom', className: 'ca-turn-custom', type: 'number', min: '1', placeholder: 'Custom' });
      extendRow.appendChild(customVal);
      var setBtn = $create('button', { className: 'ca-turn-option ca-turn-custom-btn', 'data-action': 'extend-editor-turns', 'data-id': data.id, 'data-amount': 'custom', textContent: 'Set' });
      extendRow.appendChild(setBtn);
      sectionTurns.appendChild(extendRow);
      sidebar.appendChild(sectionTurns);
    }

    // Active toggle (shared by anchors and templates)
    var sectionStatus = $create('div', { id: 'ca-editor-status', className: 'ca-editor-section' });
    var statusTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Status' });
    sectionStatus.appendChild(statusTitle);
    var toggleRow = $create('div', { className: 'ca-editor-toggle-row' });
    var statusBtn = $create('button', {
      className: 'ca-editor-status-btn' + (data.active !== false ? ' active' : ''),
      'data-action': 'toggle-editor-active',
      'data-id': data.id,
      textContent: data.active !== false ? '● Active' : '○ Inactive'
    });
    toggleRow.appendChild(statusBtn);

    if (editorType === 'anchor') {
      var scopeBtn = $create('button', {
        className: 'ca-editor-scope-btn' + (data.global ? ' active' : ''),
        'data-action': 'toggle-editor-global',
        'data-id': data.id,
        textContent: data.global ? 'Global' : 'Local'
      });
      toggleRow.appendChild(scopeBtn);
    }
    sectionStatus.appendChild(toggleRow);
    sidebar.appendChild(sectionStatus);

    // TTL (shared by anchors and templates)
    var sectionTTLCtrl = $create('div', { id: 'ca-editor-ttl', className: 'ca-editor-section' });
    var ttlCtrlTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'TTL (idle expiry)' });
    sectionTTLCtrl.appendChild(ttlCtrlTitle);

    var ttlDisplay = $create('div', { className: 'ca-editor-field' });
    var ttlLabel;
    if (data.ttlMinutes === null || data.ttlMinutes === undefined) {
      ttlLabel = $create('span', { className: 'ca-editor-field-label', textContent: 'No TTL set' });
    } else if (data.ttlExpiresAt && data.ttlExpiresAt > Date.now()) {
      var remainingMins = Math.ceil((data.ttlExpiresAt - Date.now()) / 60000);
      ttlLabel = $create('span', { className: 'ca-editor-field-label' });
      var ttlIconE = ICON_TTL.cloneNode(true);
      ttlIconE.setAttribute('class', 'ca-ttl-icon');
      ttlLabel.appendChild(ttlIconE);
      ttlLabel.appendChild(document.createTextNode(' ' + window.__ca.shared.formatTTL(remainingMins) + ' remaining · Idle: ' + window.__ca.shared.formatTTL(data.ttlMinutes)));
    } else {
      ttlLabel = $create('span', { className: 'ca-editor-field-label', textContent: 'Expired · Idle TTL: ' + window.__ca.shared.formatTTL(data.ttlMinutes) });
    }
    ttlDisplay.appendChild(ttlLabel);
    sectionTTLCtrl.appendChild(ttlDisplay);

    var ttlRow = $create('div', { className: 'ca-editor-extend-row' });
    var ttlPresets = [15, 30, 45, 60, 180, 360, 720, 1440, 4320, 10080, 43200];
    for (var tti = 0; tti < ttlPresets.length; tti++) {
      var ttlPset = ttlPresets[tti];
      var ttlPBtn = $create('button', { className: 'ca-turn-option', 'data-action': 'set-editor-ttl', 'data-id': data.id, 'data-amount': String(ttlPset), textContent: window.__ca.shared.formatTTL(ttlPset) });
      ttlRow.appendChild(ttlPBtn);
    }
    var ttlResetBtn = $create('button', { className: 'ca-turn-option', 'data-action': 'reset-editor-ttl', 'data-id': data.id, textContent: 'Reset' });
    ttlRow.appendChild(ttlResetBtn);
    var ttlRemoveBtn = $create('button', { className: 'ca-turn-option ca-editor-ttl-remove', 'data-action': 'remove-editor-ttl', 'data-id': data.id, textContent: 'Remove' });
    ttlRow.appendChild(ttlRemoveBtn);
    sectionTTLCtrl.appendChild(ttlRow);
    sidebar.appendChild(sectionTTLCtrl);

    // Usage (shared)
    var sectionUsage = $create('div', { id: 'ca-editor-usage', className: 'ca-editor-section' });
    var usageTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Usage' });
    sectionUsage.appendChild(usageTitle);
    var usageField = $create('div', { className: 'ca-editor-field' });
    var parts = [];
    if (data.usageCount) parts.push(esc(data.usageCount) + ' ' + (editorType === 'anchor' ? 'uses' : 'activations'));
    if (data.lastUsed) parts.push('Last: ' + esc(new Date(data.lastUsed).toLocaleDateString()));
    if (data.totalTurnsConsumed) parts.push(esc(data.totalTurnsConsumed) + ' turns consumed');
    var usageLabel = $create('span', { className: 'ca-editor-field-label' });
    usageLabel.textContent = parts.join(' · ') || 'No usage yet';
    usageField.appendChild(usageLabel);
    sectionUsage.appendChild(usageField);
    sidebar.appendChild(sectionUsage);

    if (editorType === 'anchor') {
      var sectionSource = $create('div', { id: 'ca-editor-source', className: 'ca-editor-section' });
      var sourceTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Source' });
      sectionSource.appendChild(sourceTitle);
      var sourceField = $create('div', { className: 'ca-editor-field' });
      var sourceInput = $create('input', {
        id: 'ca-editor-source-url',
        className: 'ca-editor-name',
        type: 'text',
        value: escAttr(data.sourceUrl || ''),
        placeholder: 'Source URL or document reference...'
      });
      sourceField.appendChild(sourceInput);
      sectionSource.appendChild(sourceField);
      sidebar.appendChild(sectionSource);

      var sectionMeta = $create('div', { className: 'ca-editor-section' });
      var metaTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Meta' });
      sectionMeta.appendChild(metaTitle);
      var metaField = $create('div', { className: 'ca-editor-field' });
      var metaDate = $create('span', { className: 'ca-editor-field-label', textContent: 'Created: ' + esc(new Date(data.createdAt).toLocaleDateString()) });
      metaField.appendChild(metaDate);
      sectionMeta.appendChild(metaField);
      sidebar.appendChild(sectionMeta);
    }

    main.appendChild(sidebar);
    body.appendChild(main);
    panel.appendChild(body);

    var footer = $create('div', { className: 'ca-editor-footer' });
    var deleteBtn = $create('button', { className: 'ca-btn-danger', 'data-action': editorType === 'anchor' ? 'delete-editor-anchor' : 'delete-editor-tpl', 'data-id': data.id, textContent: 'Delete' });
    footer.appendChild(deleteBtn);

    var spacer = $create('div', { style: { flex: '1' } });
    footer.appendChild(spacer);

    var copyBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'copy-editor', 'data-id': data.id, 'aria-label': 'Copy to clipboard', title: 'Copy' });
    copyBtn.appendChild(ICON_COPY.cloneNode(true));
    footer.appendChild(copyBtn);

    var behBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'open-behavior-editor', 'data-id': data.id, 'aria-label': 'Edit behavior', title: 'Behavior' });
    var behSpan = $create('span', { className: 'ca-behavior-badge' });
    behSpan.textContent = 'B';
    behBtn.appendChild(behSpan);
    footer.appendChild(behBtn);

    var injectBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'inject-editor', 'data-id': data.id, 'aria-label': 'Inject into prompt', title: 'Inject' });
    injectBtn.appendChild(ICON_INJECT.cloneNode(true));
    footer.appendChild(injectBtn);

    var saveDot = $create('div', { className: 'ca-save-status' });
    footer.appendChild(saveDot);

    var cancelBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'close-editor', textContent: 'Close' });
    footer.appendChild(cancelBtn);

    if (editorType === 'template') {
      var activateBtn = $create('button', { className: 'ca-btn-save', 'data-action': 'activate-editor-tpl', 'data-id': data.id, textContent: 'Activate' });
      footer.appendChild(activateBtn);
    }

    if (data.versionHistory && data.versionHistory.length > 0) {
      var hCount = data.versionHistory.length;
      var historyBtn = $create('button', { className: 'ca-btn-icon', 'data-action': 'show-history', 'data-id': data.id, textContent: 'History (' + hCount + ')', title: 'View edit history' });
      footer.appendChild(historyBtn);
    }
    panel.appendChild(footer);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);
    trapFocus(panel);

    overlay._dirty = false;
    overlay._sessionDirty = false;
    overlay.addEventListener('input', function(e) {
      var field = e.target.closest('input, select, textarea');
      if (!field) return;
      overlay._dirty = true;
      overlay._sessionDirty = true;
      var sd = window.__ca.shared.$one('.ca-save-status', overlay);
      if (sd) { sd.className = 'ca-save-status ca-save-pending'; }
      if (editorSaveTimer) clearTimeout(editorSaveTimer);
      editorSaveTimer = setTimeout(flushAnchorEditor, 400);
    });

    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      handleEditorAction(target, data, editorType);
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var wasDirtyED = overlay._sessionDirty;
        flushAnchorEditor();
        if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
        window.__ca.events.emit('anchors:changed');
        removeEditorOverlay();
        if (wasDirtyED && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
        return;
      }
      if (e.key === 'Enter') {
        var target = e.target.closest('[data-action="add-editor-tag"]');
        if (target) {
          e.preventDefault();
          var tag = target.value.trim();
          if (tag && target.dataset.id) {
            if (editorType === 'template') {
              window.__ca.storage.addTemplateTag(target.dataset.id, tag);
            } else {
              window.__ca.storage.addTag(target.dataset.id, tag);
            }
            target.value = '';
            refreshEditorSection('tags', target.dataset.id);
            tagSuggestions.className = 'ca-tag-suggestions hidden';
            selectedSuggestionIndex = -1;
          }
        }
        var triggerTarget = e.target.closest('[data-action="add-editor-trigger"]');
        if (triggerTarget) {
          e.preventDefault();
          var kw = triggerTarget.value.trim().toLowerCase();
          if (kw && triggerTarget.dataset.id) {
            if (editorType === 'template') {
              window.__ca.storage.addTemplateTriggerKeyword(triggerTarget.dataset.id, kw);
            } else {
              window.__ca.storage.addTriggerKeyword(triggerTarget.dataset.id, kw);
            }
            triggerTarget.value = '';
            refreshEditorSection('triggers', triggerTarget.dataset.id);
          }
        }
      }
    });

    var textareaEl = window.__ca.shared.$id('ca-editor-textarea');
    if (textareaEl) textareaEl.focus();

    var selectedSuggestionIndex = -1;
    var suggestionHideTimeout = null;

    function updateSuggestions(val) {
      var esc = window.__ca.shared.esc;
      var escAttr = window.__ca.shared.escAttr;
      var $create = window.__ca.shared.$create;
      var allTags = window.__ca.storage.getTags();
      while (tagSuggestions.firstChild) tagSuggestions.removeChild(tagSuggestions.firstChild);
      selectedSuggestionIndex = -1;
      if (allTags.length === 0) {
        tagSuggestions.className = 'ca-tag-suggestions hidden';
        return;
      }
      var matches;
      if (val) {
        matches = [];
        for (var ti = 0; ti < allTags.length; ti++) {
          if (allTags[ti].indexOf(val) !== -1) matches.push(allTags[ti]);
        }
      } else {
        matches = allTags;
      }
      if (matches.length === 0) {
        tagSuggestions.className = 'ca-tag-suggestions';
        var emptyMsg = $create('div', {
          className: 'ca-tag-suggestions-empty',
          textContent: val ? 'No tags match "' + esc(val) + '"' : 'No tags available'
        });
        tagSuggestions.appendChild(emptyMsg);
        return;
      }
      tagSuggestions.className = 'ca-tag-suggestions';
      for (var ti = 0; ti < matches.length; ti++) {
        (function(tagName) {
          var count = window.__ca.storage.getAnchorsByTag(tagName).length;
          var sug = $create('div', {
            className: 'ca-tag-suggestion',
            'data-action': 'select-suggestion',
            'data-tag': escAttr(tagName)
          });
          var label = $create('span', { textContent: '#' + esc(tagName) });
          sug.appendChild(label);
          if (count > 0) {
            var countEl = $create('span', { className: 'ca-tag-count', textContent: count + (count === 1 ? ' anchor' : ' anchors') });
            sug.appendChild(countEl);
          }
          tagSuggestions.appendChild(sug);
        })(matches[ti]);
      }
    }

    function selectTag(tagName) {
      if (suggestionHideTimeout) {
        clearTimeout(suggestionHideTimeout);
        suggestionHideTimeout = null;
      }
      tagInput.value = tagName;
      tagSuggestions.className = 'ca-tag-suggestions hidden';
      selectedSuggestionIndex = -1;
      tagInput.focus();
    }

    function highlightSuggestion(suggestions) {
      for (var i = 0; i < suggestions.length; i++) {
        suggestions[i].className = 'ca-tag-suggestion' + (i === selectedSuggestionIndex ? ' selected' : '');
      }
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        suggestions[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
      }
    }

    tagInput.addEventListener('focus', function() {
      if (tagInput.value.trim() === '') {
        updateSuggestions('');
      }
    });

    tagInput.addEventListener('input', function() {
      var val = tagInput.value.trim().toLowerCase();
      updateSuggestions(val);
    });

    tagInput.addEventListener('keydown', function(e) {
      var suggestions = tagSuggestions.querySelectorAll('.ca-tag-suggestion');
      if (suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedSuggestionIndex < suggestions.length - 1) {
          selectedSuggestionIndex++;
        } else {
          selectedSuggestionIndex = 0;
        }
        highlightSuggestion(suggestions);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedSuggestionIndex > 0) {
          selectedSuggestionIndex--;
        } else {
          selectedSuggestionIndex = suggestions.length - 1;
        }
        highlightSuggestion(suggestions);
      } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        var tagName = suggestions[selectedSuggestionIndex].dataset.tag;
        if (tagName) {
          selectTag(tagName);
          var currentAnchorId = tagInput.dataset.id;
          if (currentAnchorId) {
            if (editorType === 'template') {
              window.__ca.storage.addTemplateTag(currentAnchorId, tagName);
            } else {
              window.__ca.storage.addTag(currentAnchorId, tagName);
            }
            tagInput.value = '';
            refreshEditorSection('tags', currentAnchorId);
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        var freeTag = tagInput.value.trim();
        if (freeTag) {
          var currentAnchorId = tagInput.dataset.id;
          if (currentAnchorId) {
            if (editorType === 'template') {
              window.__ca.storage.addTemplateTag(currentAnchorId, freeTag);
            } else {
              window.__ca.storage.addTag(currentAnchorId, freeTag);
            }
            tagInput.value = '';
            refreshEditorSection('tags', currentAnchorId);
          }
        }
      } else if (e.key === 'Escape') {
        tagSuggestions.className = 'ca-tag-suggestions hidden';
        selectedSuggestionIndex = -1;
      }
    });

    tagInput.addEventListener('blur', function() {
      suggestionHideTimeout = setTimeout(function() { tagSuggestions.className = 'ca-tag-suggestions hidden'; }, 200);
    });

    tagSuggestions.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action="select-suggestion"]');
      if (target) {
        var tagName = target.dataset.tag;
        if (tagName) {
          var currentAnchorId = tagInput.dataset.id;
          if (currentAnchorId) {
            if (editorType === 'template') {
              window.__ca.storage.addTemplateTag(currentAnchorId, tagName);
            } else {
              window.__ca.storage.addTag(currentAnchorId, tagName);
            }
            tagInput.value = '';
            refreshEditorSection('tags', currentAnchorId);
          }
        }
      }
    });
  }

  function refreshEditorSection(section, anchorId) {
    var overlay = window.__ca.shared.$id('ca-editor-overlay');
    var editorType = overlay ? overlay._editorType : null;

    if (section === 'tags') {
      var entity = null;
      if (editorType === 'template') {
        var tpls = window.__ca.storage.getTemplates().filter(function(t) { return t.id === anchorId; });
        if (tpls.length > 0) entity = tpls[0];
      } else {
        entity = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
      }
      if (!entity) return;
      var tagRow = window.__ca.shared.$one('.ca-editor-tags');
      if (!tagRow) return;
      while (tagRow.firstChild) tagRow.removeChild(tagRow.firstChild);
      if (entity.tags && entity.tags.length > 0) {
        for (var ti = 0; ti < entity.tags.length; ti++) {
          var tChip = window.__ca.shared.$create('span', { className: 'ca-tag', 'data-action': 'remove-editor-tag', 'data-id': entity.id, 'data-tag': window.__ca.shared.escAttr(entity.tags[ti]), textContent: '#' + window.__ca.shared.esc(entity.tags[ti]) });
          tagRow.appendChild(tChip);
        }
      }
    }
    if (section === 'triggers') {
      var entityForTriggers = null;
      if (editorType === 'template') {
        var tpls2 = window.__ca.storage.getTemplates().filter(function(t) { return t.id === anchorId; });
        if (tpls2.length > 0) entityForTriggers = tpls2[0];
      } else {
        entityForTriggers = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
      }
      if (!entityForTriggers) return;
      var triggerRow = window.__ca.shared.$one('#ca-editor-triggers .ca-editor-tags');
      if (!triggerRow) return;
      while (triggerRow.firstChild) triggerRow.removeChild(triggerRow.firstChild);
      if (entityForTriggers.triggerKeywords && entityForTriggers.triggerKeywords.length > 0) {
        for (var tki = 0; tki < entityForTriggers.triggerKeywords.length; tki++) {
          var tkChip = window.__ca.shared.$create('span', { className: 'ca-tag', 'data-action': 'remove-editor-trigger', 'data-id': entityForTriggers.id, 'data-trigger': window.__ca.shared.escAttr(entityForTriggers.triggerKeywords[tki]), textContent: window.__ca.shared.esc(entityForTriggers.triggerKeywords[tki]) });
          triggerRow.appendChild(tkChip);
        }
      }
    }
    if (section === 'turns' || section === 'status' || section === 'all') {
      var anchorIdFromOverlay = window.__ca.shared.$one('.ca-editor-overlay');
      if (!anchorIdFromOverlay) return;
      anchorIdFromOverlay = anchorIdFromOverlay._editorData ? anchorIdFromOverlay._editorData.id : null;
      if (!anchorIdFromOverlay) return;

      if (editorType === 'template') {
        var tplUpdated = window.__ca.storage.getTemplates().filter(function(t) { return t.id === anchorIdFromOverlay; })[0];
        if (!tplUpdated) return;
        var statusBtn = window.__ca.shared.$one('[data-action="toggle-editor-active"]');
        if (statusBtn) {
          statusBtn.textContent = tplUpdated.active !== false ? '● Active' : '○ Inactive';
          statusBtn.className = 'ca-editor-status-btn' + (tplUpdated.active !== false ? ' active' : '');
        }
        var ttlLabel = window.__ca.shared.$one('#ca-editor-ttl .ca-editor-field-label');
        if (ttlLabel) {
          if (tplUpdated.ttlMinutes === null || tplUpdated.ttlMinutes === undefined) {
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            ttlLabel.textContent = 'No TTL set';
          } else if (tplUpdated.ttlExpiresAt && tplUpdated.ttlExpiresAt > Date.now()) {
            var remMins = Math.ceil((tplUpdated.ttlExpiresAt - Date.now()) / 60000);
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            var ttlIcon = ICON_TTL.cloneNode(true);
            ttlIcon.setAttribute('class', 'ca-ttl-icon');
            ttlLabel.appendChild(ttlIcon);
            ttlLabel.appendChild(document.createTextNode(' ' + window.__ca.shared.formatTTL(remMins) + ' remaining · Idle: ' + window.__ca.shared.formatTTL(tplUpdated.ttlMinutes)));
          } else {
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            ttlLabel.textContent = 'Expired · Idle TTL: ' + window.__ca.shared.formatTTL(tplUpdated.ttlMinutes);
          }
        }
      } else {
        var updated = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorIdFromOverlay; })[0];
        if (!updated) return;

        var turnsText = window.__ca.shared.$one('.ca-editor-turns-text');
        if (turnsText) turnsText.textContent = updated.turnsRemaining + ' / ' + updated.turnsTotal;

        var fill = window.__ca.shared.$one('.ca-editor-progress-fill');
        if (fill) {
          var pct = updated.turnsTotal > 0 ? (updated.turnsRemaining / updated.turnsTotal * 100) : 0;
          fill.style.width = pct + '%';
        }

        var statusBtn = window.__ca.shared.$one('[data-action="toggle-editor-active"]');
        if (statusBtn) {
          statusBtn.textContent = updated.active ? '● Active' : '○ Inactive';
          statusBtn.className = 'ca-editor-status-btn' + (updated.active ? ' active' : '');
        }

        var scopeBtn = window.__ca.shared.$one('[data-action="toggle-editor-global"]');
        if (scopeBtn) {
          scopeBtn.textContent = updated.global ? 'Global' : 'Local';
          scopeBtn.className = 'ca-editor-scope-btn' + (updated.global ? ' active' : '');
        }

        var ttlLabel = window.__ca.shared.$one('#ca-editor-ttl .ca-editor-field-label');
        if (ttlLabel) {
          if (!updated.ttlMinutes) {
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            ttlLabel.textContent = 'No TTL set';
          } else if (updated.ttlExpiresAt && updated.ttlExpiresAt > Date.now()) {
            var remMins = Math.ceil((updated.ttlExpiresAt - Date.now()) / 60000);
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            var ttlIcon = ICON_TTL.cloneNode(true);
            ttlIcon.setAttribute('class', 'ca-ttl-icon');
            ttlLabel.appendChild(ttlIcon);
            ttlLabel.appendChild(document.createTextNode(' ' + window.__ca.shared.formatTTL(remMins) + ' remaining · Idle: ' + window.__ca.shared.formatTTL(updated.ttlMinutes)));
          } else {
            while (ttlLabel.firstChild) ttlLabel.removeChild(ttlLabel.firstChild);
            ttlLabel.textContent = 'Expired · Idle TTL: ' + window.__ca.shared.formatTTL(updated.ttlMinutes);
          }
        }
      }
    }
    if (section === 'usage' || section === 'all') {
      var overlay = window.__ca.shared.$id('ca-editor-overlay');
      if (!overlay || !overlay._editorData) return;
      var uData = window.__ca.storage.getAll().filter(function(a) { return a.id === overlay._editorData.id; })[0];
      if (!uData) {
        uData = window.__ca.storage.getTemplates().filter(function(t) { return t.id === overlay._editorData.id; })[0];
      }
      if (!uData) return;
      var usageLabel = window.__ca.shared.$one('#ca-editor-usage .ca-editor-field-label');
      if (!usageLabel) return;
      var parts = [];
      if (uData.usageCount) parts.push(uData.usageCount + ' ' + (overlay._editorType === 'anchor' ? 'uses' : 'activations'));
      if (uData.lastUsed) parts.push('Last: ' + new Date(uData.lastUsed).toLocaleDateString());
      if (uData.totalTurnsConsumed) parts.push(uData.totalTurnsConsumed + ' turns consumed');
      usageLabel.textContent = parts.join(' · ') || 'No usage yet';
    }
  }

  function handleEditorAction(target, data, editorType) {
    var action = target.dataset.action;
    var id = target.dataset.id;

    if (action === 'show-history' && id) {
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirtySH = edOv ? edOv._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.events.emit('anchors:changed');
      var anchor = window.__ca.storage.getById(id);
      if (anchor) renderHistoryOverlay(anchor);
      if (wasDirtySH && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
    } else if (action === 'close-editor') {
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirty = edOv ? edOv._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.events.emit('anchors:changed');
      removeEditorOverlay();
      if (wasDirty && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
    } else if (action === 'copy-editor') {
      var textarea = window.__ca.shared.$id('ca-editor-textarea');
      var editorText = textarea ? textarea.value : (data.text || '');
      navigator.clipboard.writeText(editorText).catch(function() {});
    } else if (action === 'open-behavior-editor' && id) {
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirtyBE = edOv ? edOv._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.events.emit('anchors:changed');
      var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
      removeEditorOverlay();
      if (wasDirtyBE && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
      renderBehaviorEditor(anchor ? anchor.id : null);
      var behaviorOverlay = window.__ca.shared.$id('ca-behavior-editor-overlay');
      if (behaviorOverlay) behaviorOverlay._returnAnchorId = id;
    } else if (action === 'inject-editor') {
      var textareaEl = window.__ca.shared.$id('ca-editor-textarea');
      var editorText = textareaEl ? textareaEl.value : (data.text || '');
      if (editorText && window.__ca.content) {
        window.__ca.content.injectTextToPrompt(editorText);
      }
    } else if (action === 'delete-editor-anchor' && id) {
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirtyDEL = edOv ? edOv._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.events.emit('anchors:changed');
      if (wasDirtyDEL && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
      renderConfirmDialog('Delete this anchor?', function() {
        removeEditorOverlay();
        window.__ca.storage.deleteAnchor(id);
        window.__ca.events.emit('anchors:changed');
      });
    } else if (action === 'delete-editor-tpl' && id) {
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirtyTPL = edOv ? edOv._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      if (wasDirtyTPL && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
      renderConfirmDialog('Delete this template?', function() {
        removeEditorOverlay();
        window.__ca.storage.deleteTemplate(id);
        updateTemplateList();
      });
    } else if (action === 'activate-editor-tpl' && id) {
      var edOvAct = window.__ca.shared.$id('ca-editor-overlay');
      var wasDirtyACT = edOvAct ? edOvAct._sessionDirty : false;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.storage.activateTemplate(id, window.location.href);
      window.__ca.events.emit('anchors:changed');
      removeEditorOverlay();
      if (wasDirtyACT && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
    } else if (action === 'extend-editor-turns' && id) {
      var amount = target.dataset.amount;
      if (amount === 'custom') {
        var customEl = window.__ca.shared.$id('ca-editor-extend-custom');
        amount = customEl ? parseInt(customEl.value, 10) : 0;
      } else {
        amount = parseInt(amount, 10);
      }
      if (amount > 0) {
        window.__ca.storage.extendTurns(id, amount);
        window.__ca.events.emit('anchors:changed');
        refreshEditorSection('all', id);
      }
    } else if (action === 'reset-editor-turns' && id) {
      window.__ca.storage.resetTurns(id);
      window.__ca.events.emit('anchors:changed');
      refreshEditorSection('all', id);
    } else if (action === 'add-editor-tag') {
      return;
    } else if (action === 'remove-editor-tag' && id) {
      var tag = target.dataset.tag;
      if (tag) {
        if (editorType === 'template') {
          window.__ca.storage.removeTemplateTag(id, tag);
        } else {
          window.__ca.storage.removeTag(id, tag);
        }
        window.__ca.events.emit('anchors:changed');
        refreshEditorSection('tags', id);
      }
    } else if (action === 'add-editor-trigger') {
      return;
    } else if (action === 'remove-editor-trigger' && id) {
      var kw = target.dataset.trigger;
      if (kw) {
        if (editorType === 'template') {
          window.__ca.storage.removeTemplateTriggerKeyword(id, kw);
        } else {
          window.__ca.storage.removeTriggerKeyword(id, kw);
        }
        window.__ca.events.emit('anchors:changed');
        refreshEditorSection('triggers', id);
      }
    } else if (action === 'toggle-editor-active' && id) {
      if (editorType === 'template') {
        window.__ca.storage.toggleTemplateActive(id);
      } else {
        window.__ca.storage.toggleAnchor(id);
      }
      window.__ca.events.emit('anchors:changed');
      refreshEditorSection('status', id);
    } else if (action === 'toggle-editor-global' && id) {
      var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
      if (anchor) {
        window.__ca.storage.setGlobal(id, !anchor.global);
        window.__ca.events.emit('anchors:changed');
        refreshEditorSection('status', id);
      }
    } else if (action === 'set-editor-ttl' && id) {
      var ttlAmount = parseInt(target.dataset.amount, 10);
      if (ttlAmount > 0) {
        if (editorType === 'template') {
          window.__ca.storage.setTemplateTTL(id, ttlAmount);
        } else {
          window.__ca.storage.setTTL(id, ttlAmount);
        }
        window.__ca.events.emit('anchors:changed');
        refreshEditorSection('all', id);
      }
    } else if (action === 'reset-editor-ttl' && id) {
      if (editorType === 'template') {
        var rstTpl = window.__ca.storage.getTemplates().filter(function(t) { return t.id === id; })[0];
        if (rstTpl && rstTpl.ttlMinutes !== null) {
          window.__ca.storage.resetTemplateTTL(id);
        }
      } else {
        var rstAnchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (rstAnchor && rstAnchor.ttlMinutes !== null) {
          window.__ca.storage.resetTTL(id);
        }
      }
      window.__ca.events.emit('anchors:changed');
      refreshEditorSection('all', id);
    } else if (action === 'remove-editor-ttl' && id) {
      if (editorType === 'template') {
        window.__ca.storage.setTemplateTTL(id, null);
      } else {
        window.__ca.storage.setTTL(id, null);
      }
      window.__ca.events.emit('anchors:changed');
      refreshEditorSection('all', id);
    } else if (action === 'switch-editor-anchor') {
      var newId = target.value;
      if (!newId) return;
      var editorOverlay = window.__ca.shared.$id('ca-editor-overlay');
      if (!editorOverlay || !editorOverlay._editorData) return;
      if (newId === editorOverlay._editorData.id) return;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      window.__ca.events.emit('anchors:changed');
      var newAnchor = window.__ca.storage.getAll().filter(function(a) { return a.id === newId; })[0];
      if (!newAnchor) return;
      editorOverlay._editorData = newAnchor;
      var ta = window.__ca.shared.$id('ca-editor-textarea');
      if (ta) ta.value = newAnchor.text;
      var desc = window.__ca.shared.$id('ca-editor-description');
      if (desc) desc.value = newAnchor.description || '';
      var src = window.__ca.shared.$id('ca-editor-source-url');
      if (src) src.value = newAnchor.sourceUrl || '';
      var sel = window.__ca.shared.$one('.ca-editor-anchor-select');
      if (sel) sel.value = newId;
      // Update data-id on tag and trigger inputs to reflect the switched anchor
      var tagInputEl = window.__ca.shared.$one('[data-action="add-editor-tag"]');
      if (tagInputEl) tagInputEl.dataset.id = newId;
      var triggerInputEl = window.__ca.shared.$one('[data-action="add-editor-trigger"]');
      if (triggerInputEl) triggerInputEl.dataset.id = newId;
      refreshEditorSection('tags', newId);
      refreshEditorSection('triggers', newId);
      refreshEditorSection('all', newId);
    } else if (action === 'switch-editor-template') {
      var newTplId = target.value;
      if (!newTplId) return;
      var edOv = window.__ca.shared.$id('ca-editor-overlay');
      if (!edOv || !edOv._editorData) return;
      flushAnchorEditor();
      if (editorSaveTimer) { clearTimeout(editorSaveTimer); editorSaveTimer = null; }
      var ta = window.__ca.shared.$id('ca-editor-textarea');
      var nameIpt = window.__ca.shared.$id('ca-editor-name');
      var descIpt = window.__ca.shared.$id('ca-editor-description');
      updateTemplateList();
      if (newTplId === '__new__') {
        var newTpl = window.__ca.storage.createTemplate('New Template', '', []);
        edOv._editorData = newTpl;
        if (ta) ta.value = '';
        if (nameIpt) nameIpt.value = 'New Template';
        if (descIpt) descIpt.value = '';
        var ts = window.__ca.shared.$one('.ca-editor-anchor-select[data-action="switch-editor-template"]');
        if (ts) {
          while (ts.firstChild) ts.removeChild(ts.firstChild);
          var cnOpt = window.__ca.shared.$create('option', { value: '__new__', textContent: '+ Create New Template' });
          ts.appendChild(cnOpt);
          var allT = window.__ca.storage.getTemplates();
          for (var tii = 0; tii < allT.length; tii++) {
            var lb = allT[tii].name || allT[tii].text.substring(0, 40);
            if (lb.length > 40) lb = lb.substring(0, 40) + '\u2026';
            var oo = window.__ca.shared.$create('option', { value: allT[tii].id, textContent: window.__ca.shared.esc(lb), title: window.__ca.shared.esc(allT[tii].name || allT[tii].text) });
            if (allT[tii].id === newTpl.id) oo.setAttribute('selected', '');
            ts.appendChild(oo);
          }
        }
        var tagIn = window.__ca.shared.$one('[data-action="add-editor-tag"]');
        if (tagIn) tagIn.dataset.id = newTpl.id;
        var trigIn = window.__ca.shared.$one('[data-action="add-editor-trigger"]');
        if (trigIn) trigIn.dataset.id = newTpl.id;
        refreshEditorSection('tags', newTpl.id);
        refreshEditorSection('triggers', newTpl.id);
        refreshEditorSection('all', newTpl.id);
        return;
      }
      var nt = window.__ca.storage.getTemplates().filter(function(t) { return t.id === newTplId; })[0];
      if (!nt) return;
      edOv._editorData = nt;
      if (ta) ta.value = nt.text;
      if (nameIpt) nameIpt.value = nt.name || '';
      if (descIpt) descIpt.value = nt.description || '';
      var ts2 = window.__ca.shared.$one('.ca-editor-anchor-select[data-action="switch-editor-template"]');
      if (ts2) ts2.value = newTplId;
      var tagIn2 = window.__ca.shared.$one('[data-action="add-editor-tag"]');
      if (tagIn2) tagIn2.dataset.id = newTplId;
      var trigIn2 = window.__ca.shared.$one('[data-action="add-editor-trigger"]');
      if (trigIn2) trigIn2.dataset.id = newTplId;
      refreshEditorSection('tags', newTplId);
      refreshEditorSection('triggers', newTplId);
      refreshEditorSection('all', newTplId);
    }
  }

  var behaviorHelpCollapsed = true;
  var profileBehavCollapsed = false;
  var behaviorSaveTimer = null;
  var editorSaveTimer = null;

  function renderBehaviorEditor(preselectAnchorId) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;

    removeEditorOverlay();
    removeHistoryOverlay();
    removeTurnPopup();
    var oldOverlay = window.__ca.shared.$id('ca-behavior-editor-overlay');
    if (oldOverlay && oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);

    var overlay = $create('div', { id: 'ca-behavior-editor-overlay', className: 'ca-editor-overlay' });
    var panel = $create('div', { className: 'ca-editor-panel' });

    var header = $create('div', { className: 'ca-editor-header' });
    var title = $create('h2', { className: 'ca-editor-title', textContent: 'Profile & Behavior Editor' });
    header.appendChild(title);
    var closeBtn = $create('button', { className: 'ca-panel-close', 'data-action': 'close-behavior-editor', 'aria-label': 'Close editor' });
    closeBtn.appendChild(ICON_CLOSE.cloneNode(true));
    header.appendChild(closeBtn);

    // Help section in header (accordion)
    var helpSection = $create('div', { className: 'ca-behavior-help' });
    var helpToggle = $create('div', {
      className: 'ca-behavior-help-toggle',
      'data-action': 'toggle-behavior-help',
      textContent: 'Behavior field guide?  ' + (behaviorHelpCollapsed ? '\u25B6' : '\u25BE')
    });
    helpSection.appendChild(helpToggle);

    var helpBody = $create('div', { className: 'ca-behavior-help-body' });
    if (behaviorHelpCollapsed) helpBody.style.display = 'none';

    var helpIntro = $create('p', { className: 'ca-behavior-help-intro', textContent: 'Behavior fields tell the AI how to THINK and ACT — not just what to say.' });
    helpBody.appendChild(helpIntro);

    var helpGrid = $create('div', { className: 'ca-behavior-help-grid' });

    var cardTone = $create('div', { className: 'ca-behavior-help-card' });
    var iconTone = $create('span', { className: 'ca-help-icon ca-help-icon-tone', textContent: 'T' });
    cardTone.appendChild(iconTone);
    var cardToneTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Tone' });
    cardTone.appendChild(cardToneTitle);
    var cardToneDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'How the AI speaks. Technical, professional, casual, academic.' });
    cardTone.appendChild(cardToneDesc);
    helpGrid.appendChild(cardTone);

    var cardAvoid = $create('div', { className: 'ca-behavior-help-card' });
    var iconAvoid = $create('span', { className: 'ca-help-icon ca-help-icon-avoid', textContent: 'A' });
    cardAvoid.appendChild(iconAvoid);
    var cardAvoidTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Avoid' });
    cardAvoid.appendChild(cardAvoidTitle);
    var cardAvoidDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'What it must NOT do. Hype, speculation, sales-pitch language.' });
    cardAvoid.appendChild(cardAvoidDesc);
    helpGrid.appendChild(cardAvoid);

    var cardDomain = $create('div', { className: 'ca-behavior-help-card' });
    var iconDomain = $create('span', { className: 'ca-help-icon ca-help-icon-domain', textContent: 'D' });
    cardDomain.appendChild(iconDomain);
    var cardDomainTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Domain Focus' });
    cardDomain.appendChild(cardDomainTitle);
    var cardDomainDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'Topics to stay within. Add as chips (tags).' });
    cardDomain.appendChild(cardDomainDesc);
    helpGrid.appendChild(cardDomain);

    var cardSocratic = $create('div', { className: 'ca-behavior-help-card' });
    var iconSocratic = $create('span', { className: 'ca-help-icon ca-help-icon-socratic', textContent: '?' });
    cardSocratic.appendChild(iconSocratic);
    var cardSocraticTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Socratic Trigger' });
    cardSocratic.appendChild(cardSocraticTitle);
    var cardSocraticDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'Ask clarifying questions first before giving advice.' });
    cardSocratic.appendChild(cardSocraticDesc);
    helpGrid.appendChild(cardSocratic);

    var cardFormat = $create('div', { className: 'ca-behavior-help-card' });
    var iconFormat = $create('span', { className: 'ca-help-icon ca-help-icon-format', textContent: 'F' });
    cardFormat.appendChild(iconFormat);
    var cardFormatTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Output Format' });
    cardFormat.appendChild(cardFormatTitle);
    var cardFormatDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'How info looks. Tables, bullet points, paragraphs.' });
    cardFormat.appendChild(cardFormatDesc);
    helpGrid.appendChild(cardFormat);

    var cardStyle = $create('div', { className: 'ca-behavior-help-card' });
    var iconStyle = $create('span', { className: 'ca-help-icon ca-help-icon-style', textContent: 'S' });
    cardStyle.appendChild(iconStyle);
    var cardStyleTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Output Style' });
    cardStyle.appendChild(cardStyleTitle);
    var cardStyleDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'Language rules. Plain language, no jargon, short sentences.' });
    cardStyle.appendChild(cardStyleDesc);
    helpGrid.appendChild(cardStyle);

    var cardGuard = $create('div', { className: 'ca-behavior-help-card' });
    var iconGuard = $create('span', { className: 'ca-help-icon ca-help-icon-guardrail', textContent: 'G' });
    cardGuard.appendChild(iconGuard);
    var cardGuardTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Guardrail' });
    cardGuard.appendChild(cardGuardTitle);
    var cardGuardDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'A line the AI MUST include in every response.' });
    cardGuard.appendChild(cardGuardDesc);
    helpGrid.appendChild(cardGuard);

    var cardUncertain = $create('div', { className: 'ca-behavior-help-card' });
    var iconUncertain = $create('span', { className: 'ca-help-icon ca-help-icon-uncertainty', textContent: 'U' });
    cardUncertain.appendChild(iconUncertain);
    var cardUncertainTitle = $create('span', { className: 'ca-behavior-help-card-title', textContent: 'Uncertainty Protocol' });
    cardUncertain.appendChild(cardUncertainTitle);
    var cardUncertainDesc = $create('p', { className: 'ca-behavior-help-card-desc', textContent: 'What to do when unsure. Say \"I don\'t know\" instead of guessing.' });
    cardUncertain.appendChild(cardUncertainDesc);
    helpGrid.appendChild(cardUncertain);

    helpBody.appendChild(helpGrid);

    var helpTip = $create('p', { className: 'ca-behavior-help-tip' });
    helpTip.textContent = '◆ Profile = global defaults (always active)  ◆ Anchor behavior = per-topic override (triggers on matching keywords)';
    helpBody.appendChild(helpTip);

    helpSection.appendChild(helpBody);
    header.appendChild(helpSection);

    panel.appendChild(header);

    var body = $create('div', { className: 'ca-editor-body' });
    var main = $create('div', { className: 'ca-editor-main' });

    var leftCol = $create('div', { className: 'ca-behavior-left' });
    var rightCol = $create('div', { className: 'ca-behavior-right' });

    // Profile section
    var profileSection = $create('div', { className: 'ca-editor-section' });
    var profileTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Active Profile' });
    profileSection.appendChild(profileTitle);

    var profileSelectRow = $create('div', { className: 'ca-behavior-profile-row' });
    var profileSelect = $create('select', { id: 'ca-behavior-profile-select', className: 'ca-editor-anchor-select', 'data-action': 'select-behavior-profile' });
    var defaultOpt = $create('option', { value: '', textContent: 'No profile active...' });
    profileSelect.appendChild(defaultOpt);
    var allProfiles = window.__ca.storage.getAllProfiles();
    var activeProfile = window.__ca.storage.getActiveProfile();
    for (var pi = 0; pi < allProfiles.length; pi++) {
      var opt = $create('option', { value: allProfiles[pi].id, textContent: esc(allProfiles[pi].name) });
      if (activeProfile && allProfiles[pi].id === activeProfile.id) opt.setAttribute('selected', '');
      profileSelect.appendChild(opt);
    }
    profileSelectRow.appendChild(profileSelect);

    var newProfileBtn = $create('button', { className: 'ca-turn-option', 'data-action': 'new-behavior-profile', textContent: '+ New' });
    var deleteProfileBtn = $create('button', { className: 'ca-turn-option ca-btn-danger', 'data-action': 'delete-behavior-profile', textContent: 'Delete' });
    var btnRow = $create('span', { className: 'ca-behavior-btn-row' });
    btnRow.appendChild(newProfileBtn);
    btnRow.appendChild(deleteProfileBtn);
    profileSelectRow.appendChild(btnRow);
    profileSection.appendChild(profileSelectRow);

    /* Profile behavior fields (collapsible) */
    var profileBehavToggle = $create('div', {
      className: 'ca-editor-section-title ca-editor-section-clickable',
      'data-action': 'toggle-profile-behav-fields',
      textContent: 'Profile Behavior Fields  ' + (profileBehavCollapsed ? '\u25B6' : '\u25BE')
    });
    profileSection.appendChild(profileBehavToggle);
    var profileBehavBody = $create('div', { id: 'ca-behavior-profile-fields', className: 'ca-editor-behavior-body' });
    if (profileBehavCollapsed) profileBehavBody.style.display = 'none';
    /* Populate profile fields */
    var activeProfileForFields = window.__ca.storage.getActiveProfile();
    (function() {
      var pfRole = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-profile-role', value: escAttr((activeProfileForFields && activeProfileForFields.personaRole) || ''), placeholder: 'Persona role (e.g. Senior Technical Advisor)' });
      profileBehavBody.appendChild(pfRole);
      var pfReasoning = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-profile-reasoning', value: escAttr((activeProfileForFields && activeProfileForFields.reasoningProtocol) || ''), placeholder: 'Reasoning protocol (e.g. Think step-by-step internally)' });
      profileBehavBody.appendChild(pfReasoning);
      var pfVerbosity = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-profile-verbosity', value: escAttr((activeProfileForFields && activeProfileForFields.outputVerbosity) || ''), placeholder: 'Output verbosity (e.g. Low, Medium, High)' });
      profileBehavBody.appendChild(pfVerbosity);
      /* Output Format dropdown */
      var pfFmtLabel = $create('div', { className: 'ca-editor-section-subtitle', textContent: 'Output Format' });
      profileBehavBody.appendChild(pfFmtLabel);
      var pfFmt = $create('select', { id: 'ca-behavior-profile-format', className: 'ca-filter-select', 'data-action': 'change-profile-format' });
      var fmtOpts = [
        { value: '', text: 'Free text' },
        { value: 'markdown', text: 'Markdown' },
        { value: 'json', text: 'JSON' },
        { value: 'code-block', text: 'Code Block' },
        { value: 'table', text: 'Two-Column Table' }
      ];
      for (var f = 0; f < fmtOpts.length; f++) {
        pfFmt.appendChild($create('option', { value: fmtOpts[f].value, textContent: fmtOpts[f].text }));
      }
      pfFmt.value = (activeProfileForFields && activeProfileForFields.outputFormatChoice) || '';
      profileBehavBody.appendChild(pfFmt);
      /* Thinking Effort dropdown */
      var pfTeLabel = $create('div', { className: 'ca-editor-section-subtitle', textContent: 'Thinking Effort' });
      profileBehavBody.appendChild(pfTeLabel);
      var pfTe = $create('select', { id: 'ca-behavior-profile-thinking', className: 'ca-filter-select', 'data-action': 'change-profile-thinking' });
      var teOpts = [
        { value: '', text: 'Default' },
        { value: 'minimal', text: 'Minimal (fast)' },
        { value: 'medium', text: 'Medium (balanced)' },
        { value: 'high', text: 'High (deep reasoning)' }
      ];
      for (var t = 0; t < teOpts.length; t++) {
        pfTe.appendChild($create('option', { value: teOpts[t].value, textContent: teOpts[t].text }));
      }
      pfTe.value = (activeProfileForFields && activeProfileForFields.thinkingEffort) || '';
      profileBehavBody.appendChild(pfTe);
      /* Grounding Mode dropdown */
      var pfGmLabel = $create('div', { className: 'ca-editor-section-subtitle', textContent: 'Grounding Mode' });
      profileBehavBody.appendChild(pfGmLabel);
      var pfGm = $create('select', { id: 'ca-behavior-profile-grounding', className: 'ca-filter-select', 'data-action': 'change-profile-grounding' });
      var gmOpts = [
        { value: '', text: 'None' },
        { value: 'strict', text: 'Strict Grounding (tab data only)' },
        { value: 'web', text: 'Live Web Augmented' }
      ];
      for (var g = 0; g < gmOpts.length; g++) {
        pfGm.appendChild($create('option', { value: gmOpts[g].value, textContent: gmOpts[g].text }));
      }
      pfGm.value = (activeProfileForFields && activeProfileForFields.groundingMode) || '';
      profileBehavBody.appendChild(pfGm);
    })();
    profileSection.appendChild(profileBehavBody);

    leftCol.appendChild(profileSection);

    // Anchor behavior section
    var behSection = $create('div', { className: 'ca-editor-section' });
    var behTitle = $create('div', { className: 'ca-editor-section-title', textContent: 'Anchor Behavior' });
    behSection.appendChild(behTitle);

    var anchorSelectRow = $create('div', { className: 'ca-behavior-profile-row' });
    var anchorSelect = $create('select', { id: 'ca-behavior-anchor-select', className: 'ca-editor-anchor-select', 'data-action': 'select-behavior-anchor' });
    var anchorDefaultOpt = $create('option', { value: '', textContent: 'Select an anchor...' });
    anchorSelect.appendChild(anchorDefaultOpt);
    var allAnchors = window.__ca.storage.getAll();
    for (var ai = 0; ai < allAnchors.length; ai++) {
      var aLabel = allAnchors[ai].text.substring(0, 60);
      if (allAnchors[ai].text.length > 60) aLabel += '\u2026';
      var aOpt = $create('option', { value: allAnchors[ai].id, textContent: esc(aLabel) });
      anchorSelect.appendChild(aOpt);
    }
    anchorSelectRow.appendChild(anchorSelect);
    behSection.appendChild(anchorSelectRow);

    behSection.appendChild($create('div', { id: 'ca-behavior-anchor-fields', className: 'ca-editor-behavior-body' }));

    var saveRow = $create('div', { className: 'ca-behavior-save-row' });
    var clearBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'clear-behavior-anchor', textContent: 'Clear Fields' });
    saveRow.appendChild(clearBtn);
    behSection.appendChild(saveRow);
    leftCol.appendChild(behSection);

    main.appendChild(leftCol);

    // Live preview
    var previewSection = $create('div', { className: 'ca-editor-section ca-behavior-preview-section' });
    var previewHeader = $create('div', { className: 'ca-editor-section-title ca-editor-section-clickable', 'data-action': 'toggle-behavior-preview', textContent: 'Live Preview  \u25BE' });
    previewSection.appendChild(previewHeader);
    var previewBody = $create('div', { id: 'ca-behavior-preview-body', className: 'ca-behavior-preview-body' });
    var previewText = $create('pre', { id: 'ca-behavior-preview-text', className: 'ca-behavior-preview-text' });
    previewText.textContent = 'Select a profile and an anchor to preview the compiled system instruction.';
    previewBody.appendChild(previewText);
    previewSection.appendChild(previewBody);
    rightCol.appendChild(previewSection);
    main.appendChild(rightCol);

    body.appendChild(main);
    panel.appendChild(body);

    var footer = $create('div', { className: 'ca-editor-footer' });
    var exportBtn = $create('button', { className: 'ca-btn-footer', 'data-action': 'export-profiles', 'aria-label': 'Export profiles', title: 'Export profiles' });
    var exportSvg = window.__ca.shared.$icon('0 0 24 24', [
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' } },
      { tag: 'polyline', attrs: { points: '7 10 12 15 17 10' } },
      { tag: 'line', attrs: { x1: '12', y1: '15', x2: '12', y2: '3' } }
    ]);
    exportBtn.appendChild(exportSvg);
    footer.appendChild(exportBtn);
    var importBtn = $create('button', { className: 'ca-btn-footer', 'data-action': 'import-profiles', 'aria-label': 'Import profiles', title: 'Import profiles' });
    var importSvg = window.__ca.shared.$icon('0 0 24 24', [
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4' } },
      { tag: 'polyline', attrs: { points: '7 10 12 5 17 10' } },
      { tag: 'line', attrs: { x1: '12', y1: '5', x2: '12', y2: '15' } }
    ]);
    importBtn.appendChild(importSvg);
    footer.appendChild(importBtn);
    var spacer = $create('div', { style: { flex: '1' } });
    footer.appendChild(spacer);
    footer.appendChild($create('input', { type: 'file', className: 'ca-import-input', 'data-action': 'import-profiles-file', accept: '.json', 'aria-label': 'Import profiles file' }));
    var saveDot = $create('div', { className: 'ca-save-status' });
    footer.appendChild(saveDot);
    var applyBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'close-behavior-editor', textContent: 'Close' });
    footer.appendChild(applyBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);
    trapFocus(panel);

    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      handleBehaviorEditorAction(target);
    });

    overlay.addEventListener('change', function(e) {
      var target = e.target.closest('[data-action="import-profiles-file"]');
      if (target) importProfiles(target);
    });

    overlay._dirty = false;
    overlay._sessionDirty = false;
    overlay.addEventListener('input', function(e) {
      var field = e.target.closest('input, select, textarea');
      if (!field) return;
      overlay._dirty = true;
      overlay._sessionDirty = true;
      var sd = window.__ca.shared.$one('.ca-save-status', overlay);
      if (sd) { sd.className = 'ca-save-status ca-save-pending'; }
      if (behaviorSaveTimer) clearTimeout(behaviorSaveTimer);
      behaviorSaveTimer = setTimeout(flushBehaviorFields, 400);
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var wasDirtyBH = overlay._sessionDirty;
        flushBehaviorFields();
        if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
        window.__ca.content.loadActiveProfile();
        window.__ca.events.emit('anchors:changed');
        removeBehaviorEditor();
        if (wasDirtyBH && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
        return;
      }
      var domainTarget = e.target.closest('[data-action="add-behavior-domain"]');
      if (domainTarget && e.key === 'Enter') {
        e.preventDefault();
        var dom = domainTarget.value.trim();
        if (dom) {
          var selectEl = window.__ca.shared.$id('ca-behavior-anchor-select');
          var anchorId = selectEl ? selectEl.value : null;
          if (anchorId) {
            var entity = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
            if (entity) {
              var existing = Array.isArray(entity.domainFocus) ? entity.domainFocus.slice() : [];
              if (existing.indexOf(dom) === -1) {
                existing.push(dom);
                window.__ca.storage.updateAnchor(anchorId, { domainFocus: existing });
                window.__ca.events.emit('anchors:changed');
                var domainRow = window.__ca.shared.$one('#ca-behavior-anchor-fields .ca-editor-tags');
                if (domainRow) {
                  while (domainRow.firstChild) domainRow.removeChild(domainRow.firstChild);
                  for (var di = 0; di < existing.length; di++) {
                    var dChip = window.__ca.shared.$create('span', { className: 'ca-tag', 'data-action': 'remove-behavior-domain', 'data-domain': window.__ca.shared.escAttr(existing[di]), textContent: window.__ca.shared.esc(existing[di]) });
                    domainRow.appendChild(dChip);
                  }
                }
              }
              updateBehaviorPreview();
            }
          }
          domainTarget.value = '';
        }
      }
    });

    overlay.addEventListener('input', function(e) {
      var fieldIds = ['ca-behavior-tone', 'ca-behavior-avoid', 'ca-behavior-socratic',
        'ca-behavior-format', 'ca-behavior-style', 'ca-behavior-guard', 'ca-behavior-uncertainty',
        'ca-behavior-profile-role', 'ca-behavior-profile-reasoning', 'ca-behavior-profile-verbosity',
        'ca-behavior-format-choice', 'ca-behavior-profile-format', 'ca-behavior-profile-thinking',
        'ca-behavior-profile-grounding'];
      if (fieldIds.indexOf(e.target.id) !== -1) updateBehaviorPreview();
    });
    /* Select elements fire 'change' not 'input' */
    overlay.addEventListener('change', function(e) {
      var selectIds = ['ca-behavior-format-choice', 'ca-behavior-profile-format',
        'ca-behavior-profile-thinking', 'ca-behavior-profile-grounding'];
      if (selectIds.indexOf(e.target.id) !== -1) updateBehaviorPreview();
    });

    if (preselectAnchorId) {
      anchorSelect.value = preselectAnchorId;
      renderBehaviorAnchorFields(preselectAnchorId);
    }
    updateBehaviorPreview();
  }

  function handleBehaviorEditorAction(target) {
    var action = target.dataset.action;

    if (action === 'close-behavior-editor') {
      var behOv = window.__ca.shared.$id('ca-behavior-editor-overlay');
      var wasDirtyBH = behOv ? behOv._sessionDirty : false;
      flushBehaviorFields();
      if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
      window.__ca.content.loadActiveProfile();
      window.__ca.events.emit('anchors:changed');
      removeBehaviorEditor();
      if (wasDirtyBH && window.__ca.content && window.__ca.content.showToast) setTimeout(function() { window.__ca.content.showToast('Changes auto-saved', 'success'); }, 0);
    } else if (action === 'toggle-behavior-help') {
      behaviorHelpCollapsed = !behaviorHelpCollapsed;
      var helpBody = window.__ca.shared.$one('.ca-behavior-help-body');
      var helpToggle = window.__ca.shared.$one('.ca-behavior-help-toggle');
      if (helpBody) helpBody.style.display = behaviorHelpCollapsed ? 'none' : '';
      if (helpToggle) helpToggle.textContent = 'Behavior field guide?  ' + (behaviorHelpCollapsed ? '\u25B6' : '\u25BE');
    } else if (action === 'toggle-behavior-preview') {
      var previewBody = window.__ca.shared.$id('ca-behavior-preview-body');
      var previewToggle = target;
      if (previewBody) {
        var isCollapsed = previewBody.style.display === 'none';
        previewBody.style.display = isCollapsed ? '' : 'none';
        previewToggle.textContent = 'Live Preview  ' + (isCollapsed ? '\u25BE' : '\u25B6');
      }
    } else if (action === 'toggle-profile-behav-fields') {
      profileBehavCollapsed = !profileBehavCollapsed;
      var pBody = window.__ca.shared.$id('ca-behavior-profile-fields');
      var pToggle = target;
      if (pBody) pBody.style.display = profileBehavCollapsed ? 'none' : '';
      if (pToggle) pToggle.textContent = 'Profile Behavior Fields  ' + (profileBehavCollapsed ? '\u25B6' : '\u25BE');
    } else if (action === 'select-behavior-profile') {
      flushBehaviorFields();
      var profileId = target.value;
      if (profileId) {
        window.__ca.storage.setActiveProfile(profileId);
        window.__ca.content.loadActiveProfile();
        updateProfileBehaviorFields();
        updateBehaviorPreview();
      }
    } else if (action === 'new-behavior-profile') {
      var name = prompt('Profile name:');
      if (name && name.trim()) {
        var promptElement = window.__ca.storage.createProfile(name.trim(), {
          role_definition: name.trim(),
          reasoning_protocol: '',
          domain_focus: [],
          output_requirements: { format: '', clarity: '', compliance: '' },
          tone_profile: { tone: '', avoid: '' },
          socratic_trigger: '',
          uncertainty_protocol: ''
        });
        if (promptElement) {
          window.__ca.storage.setActiveProfile(promptElement.id);
          window.__ca.content.loadActiveProfile();
          flushBehaviorFields();
          if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
          renderBehaviorEditor();
        }
      }
    } else if (action === 'delete-behavior-profile') {
      var sel = window.__ca.shared.$id('ca-behavior-profile-select');
      if (!sel || !sel.value) return;
      if (!confirm('Delete profile "' + sel.options[sel.selectedIndex].text + '"?')) return;
      window.__ca.storage.deleteProfile(sel.value);
      var afterDeleteProfile = window.__ca.storage.getActiveProfile();
      if (!afterDeleteProfile) {
        window.__ca.state.profileSystemInstruction = null;
        if (window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
      }
      flushBehaviorFields();
      if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
      renderBehaviorEditor();
    } else if (action === 'select-behavior-anchor') {
      flushBehaviorFields();
      if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
      var anchorId = target.value;
      renderBehaviorAnchorFields(anchorId);
      updateBehaviorPreview();
    } else if (action === 'export-profiles') {
      exportProfiles();
    } else if (action === 'import-profiles') {
      var pfInput = window.__ca.shared.$one('[data-action="import-profiles-file"]');
      if (pfInput) pfInput.click();
    } else if (action === 'clear-behavior-anchor') {
      var cAnchorId = window.__ca.shared.$id('ca-behavior-anchor-select').value;
      if (!cAnchorId) return;
      window.__ca.storage.updateAnchor(cAnchorId, {
        toneProfile: null, domainFocus: null, socraticTrigger: null,
        outputRequirements: null, uncertaintyProtocol: null, outputFormatChoice: ''
      });
      window.__ca.events.emit('anchors:changed');
      renderBehaviorAnchorFields(cAnchorId);
      updateBehaviorPreview();
      window.__ca.content.showToast('Behavior fields cleared', 'success');
    } else if (action === 'remove-behavior-domain') {
      var domainVal = target.dataset.domain;
      var dAnchorId = window.__ca.shared.$id('ca-behavior-anchor-select').value;
      if (domainVal && dAnchorId) {
        var ent = window.__ca.storage.getAll().filter(function(a) { return a.id === dAnchorId; })[0];
        if (ent && Array.isArray(ent.domainFocus)) {
          var filtered = ent.domainFocus.filter(function(d) { return d !== domainVal; });
          window.__ca.storage.updateAnchor(dAnchorId, { domainFocus: filtered.length > 0 ? filtered : null });
          window.__ca.events.emit('anchors:changed');
          var dRow = window.__ca.shared.$one('#ca-behavior-anchor-fields .ca-editor-tags');
          if (dRow) {
            while (dRow.firstChild) dRow.removeChild(dRow.firstChild);
            if (filtered.length > 0) {
              for (var di = 0; di < filtered.length; di++) {
                var chip = window.__ca.shared.$create('span', { className: 'ca-tag', 'data-action': 'remove-behavior-domain', 'data-domain': window.__ca.shared.escAttr(filtered[di]), textContent: window.__ca.shared.esc(filtered[di]) });
                dRow.appendChild(chip);
              }
            }
          }
          updateBehaviorPreview();
        }
      }
    }
  }

  function removeBehaviorEditor() {
    var overlay = window.__ca.shared.$id('ca-behavior-editor-overlay');
    var returnAnchorId = overlay ? overlay._returnAnchorId : null;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (returnAnchorId) {
      var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === returnAnchorId; })[0];
      if (anchor) renderEditorOverlay('anchor', anchor);
    }
  }

  function updateProfileBehaviorFields() {
    var activeProfile = window.__ca.storage.getActiveProfile();
    var roleInp = window.__ca.shared.$id('ca-behavior-profile-role');
    var reasoningInp = window.__ca.shared.$id('ca-behavior-profile-reasoning');
    var verbosityInp = window.__ca.shared.$id('ca-behavior-profile-verbosity');
    var fmtSelect = window.__ca.shared.$id('ca-behavior-profile-format');
    var teSelect = window.__ca.shared.$id('ca-behavior-profile-thinking');
    var gmSelect = window.__ca.shared.$id('ca-behavior-profile-grounding');
    if (roleInp) roleInp.value = (activeProfile && activeProfile.personaRole) || '';
    if (reasoningInp) reasoningInp.value = (activeProfile && activeProfile.reasoningProtocol) || '';
    if (verbosityInp) verbosityInp.value = (activeProfile && activeProfile.outputVerbosity) || '';
    if (fmtSelect) fmtSelect.value = (activeProfile && activeProfile.outputFormatChoice) || '';
    if (teSelect) teSelect.value = (activeProfile && activeProfile.thinkingEffort) || '';
    if (gmSelect) gmSelect.value = (activeProfile && activeProfile.groundingMode) || '';
  }

  function renderBehaviorAnchorFields(anchorId) {
    var section = window.__ca.shared.$id('ca-behavior-anchor-fields');
    if (!section) return;
    while (section.firstChild) section.removeChild(section.firstChild);
    if (!anchorId) { section.style.display = 'none'; return; }
    section.style.display = '';

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var escAttr = window.__ca.shared.escAttr;
    var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
    if (!anchor) return;

    var toneInput = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-tone', value: escAttr((anchor.toneProfile && anchor.toneProfile.tone) || ''), placeholder: 'Tone (e.g. Technical, data-driven)' });
    section.appendChild(toneInput);

    var avoidInput = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-avoid', value: escAttr((anchor.toneProfile && anchor.toneProfile.avoid) || ''), placeholder: 'Avoid (e.g. Hype, speculation)' });
    section.appendChild(avoidInput);

    var domainInput = $create('input', { className: 'ca-editor-tag-input', 'data-action': 'add-behavior-domain', type: 'text', placeholder: 'Domain focus + Enter', autocomplete: 'off' });
    section.appendChild(domainInput);
    var domainRow = $create('div', { className: 'ca-editor-tags' });
    if (anchor.domainFocus && anchor.domainFocus.length > 0) {
      for (var di = 0; di < anchor.domainFocus.length; di++) {
        var dChip = $create('span', { className: 'ca-tag', 'data-action': 'remove-behavior-domain', 'data-domain': escAttr(anchor.domainFocus[di]), textContent: esc(anchor.domainFocus[di]) });
        domainRow.appendChild(dChip);
      }
    }
    section.appendChild(domainRow);

    var socraticInput = $create('textarea', { className: 'ca-editor-textarea ca-editor-behavior-textarea', id: 'ca-behavior-socratic', placeholder: 'Socratic trigger (e.g. Ask about time horizon before recommending)' });
    socraticInput.value = anchor.socraticTrigger || '';
    section.appendChild(socraticInput);

    var fmtLabel = $create('div', { className: 'ca-editor-section-subtitle ca-editor-section-subtitle-inline', textContent: 'Output Format' });
    section.appendChild(fmtLabel);
    var fmtChoice = $create('select', { id: 'ca-behavior-format-choice', className: 'ca-filter-select', 'data-action': 'change-behavior-format' });
    var fmtOptsA = [
      { value: '', text: 'Free text' },
      { value: 'markdown', text: 'Markdown' },
      { value: 'json', text: 'JSON' },
      { value: 'code-block', text: 'Code Block' },
      { value: 'table', text: 'Two-Column Table' }
    ];
    for (var fi = 0; fi < fmtOptsA.length; fi++) {
      fmtChoice.appendChild($create('option', { value: fmtOptsA[fi].value, textContent: fmtOptsA[fi].text }));
    }
    fmtChoice.value = anchor.outputFormatChoice || '';
    section.appendChild(fmtChoice);

    var formatInput = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-format', value: escAttr((anchor.outputRequirements && anchor.outputRequirements.format) || ''), placeholder: 'Format description (e.g. Bullet points)' });
    section.appendChild(formatInput);

    var styleInput = $create('input', { className: 'ca-editor-tag-input', type: 'text', id: 'ca-behavior-style', value: escAttr((anchor.outputRequirements && anchor.outputRequirements.clarity) || ''), placeholder: 'Output style (e.g. Plain language)' });
    section.appendChild(styleInput);

    var guardInput = $create('textarea', { className: 'ca-editor-textarea ca-editor-behavior-textarea', id: 'ca-behavior-guard', placeholder: 'Guardrail (e.g. Mention volatility risks)' });
    guardInput.value = (anchor.outputRequirements && anchor.outputRequirements.compliance) || '';
    section.appendChild(guardInput);

    var uncInput = $create('textarea', { className: 'ca-editor-textarea ca-editor-behavior-textarea', id: 'ca-behavior-uncertainty', placeholder: 'Uncertainty protocol (e.g. Do not predict prices)' });
    uncInput.value = anchor.uncertaintyProtocol || '';
    section.appendChild(uncInput);
  }

  function updateBehaviorPreview() {
    var previewText = window.__ca.shared.$id('ca-behavior-preview-text');
    if (!previewText) return;
    var parts = [];

    /* Build live profile assembly from DOM fields + storage */
    var activeProfile = window.__ca.storage.getActiveProfile();
    if (!activeProfile) {
      parts.push('No active profile selected.');
    } else {
      var roleVal = (window.__ca.shared.$id('ca-behavior-profile-role') || {}).value || activeProfile.personaRole || '';
      var reasoningVal = (window.__ca.shared.$id('ca-behavior-profile-reasoning') || {}).value || activeProfile.reasoningProtocol || '';
      var verbosityVal = (window.__ca.shared.$id('ca-behavior-profile-verbosity') || {}).value || activeProfile.outputVerbosity || '';
      var fmtChoiceVal = (window.__ca.shared.$id('ca-behavior-profile-format') || {}).value || activeProfile.outputFormatChoice || '';
      var teVal = (window.__ca.shared.$id('ca-behavior-profile-thinking') || {}).value || activeProfile.thinkingEffort || '';
      var gmVal = (window.__ca.shared.$id('ca-behavior-profile-grounding') || {}).value || activeProfile.groundingMode || '';
      var liveProfile = Object.assign({}, activeProfile);
      liveProfile.personaRole = roleVal.trim() || '';
      liveProfile.reasoningProtocol = reasoningVal.trim() || '';
      liveProfile.outputVerbosity = verbosityVal.trim() || '';
      liveProfile.outputFormatChoice = fmtChoiceVal || '';
      liveProfile.thinkingEffort = teVal || '';
      liveProfile.groundingMode = gmVal || '';
      var compiled = window.__ca.content.compileProfileSystemInstruction(liveProfile);
      if (compiled) {
        parts.push(compiled);
      } else {
        parts.push('[Profile fields empty — compiled instruction would be empty]');
      }
    }

    var anchorId = window.__ca.shared.$id('ca-behavior-anchor-select');
    var toneField = window.__ca.shared.$id('ca-behavior-tone');
    if (anchorId && anchorId.value && toneField) {
      var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId.value; })[0];
      if (anchor) {
        var toneVal = toneField.value;
        var avoidVal = (window.__ca.shared.$id('ca-behavior-avoid') || {}).value;
        var socraticVal = (window.__ca.shared.$id('ca-behavior-socratic') || {}).value;
        var fmtVal = (window.__ca.shared.$id('ca-behavior-format') || {}).value;
        var styleVal = (window.__ca.shared.$id('ca-behavior-style') || {}).value;
        var grVal = (window.__ca.shared.$id('ca-behavior-guard') || {}).value;
        var uncVal = (window.__ca.shared.$id('ca-behavior-uncertainty') || {}).value;
        var fmtChoiceValA = (window.__ca.shared.$id('ca-behavior-format-choice') || {}).value || anchor.outputFormatChoice || '';
        var liveAnchor = Object.assign({}, anchor);
        if (toneVal && toneVal.trim() || avoidVal && avoidVal.trim()) {
          liveAnchor.toneProfile = { tone: (toneVal || '').trim(), avoid: (avoidVal || '').trim() };
        } else {
          liveAnchor.toneProfile = null;
        }
        liveAnchor.socraticTrigger = (socraticVal && socraticVal.trim()) ? socraticVal.trim() : null;
        if (fmtVal && fmtVal.trim() || styleVal && styleVal.trim() || grVal && grVal.trim()) {
          liveAnchor.outputRequirements = { format: (fmtVal || '').trim(), clarity: (styleVal || '').trim(), compliance: (grVal || '').trim() };
        } else {
          liveAnchor.outputRequirements = null;
        }
        liveAnchor.uncertaintyProtocol = (uncVal && uncVal.trim()) ? uncVal.trim() : null;
        liveAnchor.outputFormatChoice = fmtChoiceValA || '';
        var block = window.__ca.content.compileAnchorBehaviorBlock(liveAnchor);
        if (block) parts.push('\n\n' + block);
      }
    }
    previewText.textContent = parts.join('');
  }

  function flushBehaviorFields() {
    if (!window.__ca.storage) return;
    var overlay = window.__ca.shared.$id('ca-behavior-editor-overlay');
    if (overlay) overlay._dirty = false;
    /* Profile fields */
    var activeProfile = window.__ca.storage.getActiveProfile();
    if (activeProfile) {
      var roleVal = (window.__ca.shared.$id('ca-behavior-profile-role') || {}).value;
      var reasoningVal = (window.__ca.shared.$id('ca-behavior-profile-reasoning') || {}).value;
      var verbosityVal = (window.__ca.shared.$id('ca-behavior-profile-verbosity') || {}).value;
      var fmtVal = (window.__ca.shared.$id('ca-behavior-profile-format') || {}).value;
      var teVal = (window.__ca.shared.$id('ca-behavior-profile-thinking') || {}).value;
      var gmVal = (window.__ca.shared.$id('ca-behavior-profile-grounding') || {}).value;
      window.__ca.storage.updateProfile(activeProfile.id, {
        personaRole: (roleVal && roleVal.trim()) ? roleVal.trim() : '',
        reasoningProtocol: (reasoningVal && reasoningVal.trim()) ? reasoningVal.trim() : '',
        outputVerbosity: (verbosityVal && verbosityVal.trim()) ? verbosityVal.trim() : '',
        outputFormatChoice: fmtVal || '',
        thinkingEffort: teVal || '',
        groundingMode: gmVal || ''
      });
    }
    /* Anchor fields — only flush if the anchor fields DOM has been rendered */
    var anchorSelect = window.__ca.shared.$id('ca-behavior-anchor-select');
    var anchorId = anchorSelect ? anchorSelect.value : null;
    var toneField = window.__ca.shared.$id('ca-behavior-tone');
    if (anchorId && toneField) {
      var toneVal = toneField.value;
      var avoidVal = (window.__ca.shared.$id('ca-behavior-avoid') || {}).value;
      var socraticVal = (window.__ca.shared.$id('ca-behavior-socratic') || {}).value;
      var fmtValA = (window.__ca.shared.$id('ca-behavior-format') || {}).value;
      var styleVal = (window.__ca.shared.$id('ca-behavior-style') || {}).value;
      var grVal = (window.__ca.shared.$id('ca-behavior-guard') || {}).value;
      var uncVal = (window.__ca.shared.$id('ca-behavior-uncertainty') || {}).value;
      var fmtChoiceVal = (window.__ca.shared.$id('ca-behavior-format-choice') || {}).value;
      var entity = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
      if (entity) {
        var updates = {};
        if (toneVal || avoidVal) { var tp = {}; if (toneVal) tp.tone = toneVal.trim(); if (avoidVal) tp.avoid = avoidVal.trim(); updates.toneProfile = tp; }
        else updates.toneProfile = null;
        if (entity.domainFocus && entity.domainFocus.length > 0) updates.domainFocus = entity.domainFocus;
        else updates.domainFocus = null;
        updates.socraticTrigger = (socraticVal && socraticVal.trim()) ? socraticVal.trim() : null;
        if (fmtValA || styleVal || grVal) { var or = {}; if (fmtValA) or.format = fmtValA.trim(); if (styleVal) or.clarity = styleVal.trim(); if (grVal) or.compliance = grVal.trim(); updates.outputRequirements = or; }
        else updates.outputRequirements = null;
        updates.uncertaintyProtocol = (uncVal && uncVal.trim()) ? uncVal.trim() : null;
        updates.outputFormatChoice = fmtChoiceVal || '';
        window.__ca.storage.updateAnchor(anchorId, updates);
      }
    }
    updateBehaviorPreview();
    var sd = window.__ca.shared.$one('.ca-save-status', overlay);
    if (sd) {
      sd.className = 'ca-save-status ca-save-saved';
      if (sd._hideTimer) clearTimeout(sd._hideTimer);
      sd._hideTimer = setTimeout(function() { sd.className = 'ca-save-status'; }, 1000);
    }
  }

  function flushAnchorEditor() {
    var overlay = window.__ca.shared.$id('ca-editor-overlay');
    if (!overlay || !overlay._editorData) return;
    overlay._dirty = false;
    var id = overlay._editorData.id;
    var editorType = overlay._editorType;
    var textarea = window.__ca.shared.$id('ca-editor-textarea');
    var descInput = window.__ca.shared.$id('ca-editor-description');
    var updates = {};
    if (textarea && textarea.value.trim()) updates.text = textarea.value.trim();
    if (descInput) updates.description = descInput.value.trim().substring(0, 80);
    if (editorType === 'template') {
      var nameInput = window.__ca.shared.$id('ca-editor-name');
      if (nameInput && nameInput.value.trim()) updates.name = nameInput.value.trim();
      if (Object.keys(updates).length > 0) {
        window.__ca.storage.updateTemplate(id, updates);
      }
    } else {
      var srcInput = window.__ca.shared.$id('ca-editor-source-url');
      if (srcInput) updates.sourceUrl = srcInput.value.trim();

      var toneEl = window.__ca.shared.$id('ca-editor-behavior-tone');
      if (toneEl) {
        var toneVal = toneEl.value;
        var avoidVal = (window.__ca.shared.$id('ca-editor-behavior-avoid') || {}).value;
        if (toneVal || avoidVal) {
          var tp = {};
          if (toneVal) tp.tone = toneVal.trim();
          if (avoidVal) tp.avoid = avoidVal.trim();
          updates.toneProfile = tp;
        } else {
          updates.toneProfile = null;
        }

        var entity = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (entity && Array.isArray(entity.domainFocus) && entity.domainFocus.length > 0) {
          updates.domainFocus = entity.domainFocus;
        } else {
          updates.domainFocus = null;
        }

        var socraticVal = (window.__ca.shared.$id('ca-editor-behavior-socratic') || {}).value;
        updates.socraticTrigger = (socraticVal && socraticVal.trim()) ? socraticVal.trim() : null;

        var fmtVal = (window.__ca.shared.$id('ca-editor-behavior-format') || {}).value;
        var styleVal = (window.__ca.shared.$id('ca-editor-behavior-style') || {}).value;
        var grVal = (window.__ca.shared.$id('ca-editor-behavior-guardrail') || {}).value;
        if (fmtVal || styleVal || grVal) {
          var or = {};
          if (fmtVal) or.format = fmtVal.trim();
          if (styleVal) or.clarity = styleVal.trim();
          if (grVal) or.compliance = grVal.trim();
          updates.outputRequirements = or;
        } else {
          updates.outputRequirements = null;
        }

        var uncertaintyVal = (window.__ca.shared.$id('ca-editor-behavior-uncertainty') || {}).value;
        updates.uncertaintyProtocol = (uncertaintyVal && uncertaintyVal.trim()) ? uncertaintyVal.trim() : null;
      }

      window.__ca.storage.updateAnchor(id, updates);
    }
    var sd = window.__ca.shared.$one('.ca-save-status', overlay);
    if (sd) {
      sd.className = 'ca-save-status ca-save-saved';
      if (sd._hideTimer) clearTimeout(sd._hideTimer);
      sd._hideTimer = setTimeout(function() { sd.className = 'ca-save-status'; }, 1000);
    }
  }

  function removeEditorOverlay() {
    var overlay = window.__ca.shared.$id('ca-editor-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (editorEscapeHandler) {
      document.removeEventListener('keydown', editorEscapeHandler);
      editorEscapeHandler = null;
    }
  }

  function renderHistoryOverlay(anchorData) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    removeEditorOverlay();
    removeHistoryOverlay();

    var overlay = $create('div', { id: 'ca-editor-overlay', className: 'ca-editor-overlay' });
    var panel = $create('div', { className: 'ca-editor-panel' });

    var header = $create('div', { className: 'ca-editor-header' });
    var title = $create('h2', { className: 'ca-editor-title', textContent: 'Version History' });
    header.appendChild(title);
    panel.appendChild(header);

    var body = $create('div', { className: 'ca-editor-body' });
    var history = anchorData.versionHistory || [];

    if (history.length === 0) {
      var empty = $create('div', { className: 'ca-tag-suggestions-empty', textContent: 'No previous versions available' });
      body.appendChild(empty);
    } else {
      for (var hi = history.length - 1; hi >= 0; hi--) {
        var entry = history[hi];
        var dt = new Date(entry.timestamp);
        var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString();
        var entryDiv = $create('div', { className: 'ca-editor-section' });

        var label = $create('div', { className: 'ca-history-label', textContent: esc(entry.field) + ' — ' + dateStr });
        entryDiv.appendChild(label);

        var prevText = $create('div', { className: 'ca-history-prev', textContent: esc(entry.value) });
        entryDiv.appendChild(prevText);

        var restoreBtn = $create('button', {
          className: 'ca-btn-save',
          'data-action': 'restore-version',
          'data-id': anchorData.id,
          'data-index': String(hi),
          textContent: 'Restore'
        });
        entryDiv.appendChild(restoreBtn);
        body.appendChild(entryDiv);
      }
    }

    panel.appendChild(body);

    var footer = $create('div', { className: 'ca-editor-footer' });
    var closeBtn = $create('button', { className: 'ca-btn-cancel', 'data-action': 'close-editor', textContent: 'Close' });
    footer.appendChild(closeBtn);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);

    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;
      var btnId = target.dataset.id;

      if (action === 'close-editor') {
        removeEditorOverlay();
      } else if (action === 'restore-version' && btnId) {
        var idx = parseInt(target.dataset.index, 10);
        window.__ca.storage.restoreVersion(btnId, idx);
        window.__ca.events.emit('anchors:changed');
        var restored = window.__ca.storage.getById(btnId);
        if (restored) {
          removeEditorOverlay();
          renderEditorOverlay('anchor', restored);
        }
      }
    });

    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') removeEditorOverlay();
    });
  }

  function removeHistoryOverlay() {
    var overlay = window.__ca.shared.$id('ca-editor-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function setupPanelEvents() {
    var panel = window.__ca.shared.$id('ca-panel');
    if (!panel) return;

    panel.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      var action = target.dataset.action;
      var id = target.dataset.id;

      if (action === 'open-behavior-editor') {
        renderBehaviorEditor();
      } else if (action === 'toggle-constraints-tab') {
        if (currentTab === 'constraints') {
          switchTab('anchors');
        } else {
          switchTab('constraints');
        }
      } else if (action === 'toggle-panel') {
        panel.classList.toggle('open');
      } else if (action === 'close-panel') {
        panel.classList.remove('open');
      } else if (action === 'switch-tab') {
        switchTab(target.dataset.tab);
      } else if (action === 'edit-behavior' && id) {
        renderBehaviorEditor(id);
      } else if (action === 'toggle-anchor' && id) {
        window.__ca.storage.toggleAnchor(id);
        window.__ca.events.emit('anchors:changed');
        showBulkToast('Anchor toggled');
      } else if (action === 'delete-anchor' && id) {
        renderConfirmDialog('Delete this anchor?', function() {
          window.__ca.storage.deleteAnchor(id);
          window.__ca.events.emit('anchors:changed');
        });
      } else if (action === 'restore-anchor' && id) {
        window.__ca.storage.restoreAnchor(id);
        window.__ca.events.emit('anchors:changed');
      } else if (action === 'purge-anchor' && id) {
        renderConfirmDialog('Permanently delete this anchor?', function() {
          window.__ca.storage.permanentDeleteAnchor(id);
          window.__ca.events.emit('anchors:changed');
        });
      } else if (action === 'copy-anchor' && id) {
        var ca = window.__ca.storage.getAll().filter(function(x) { return x.id === id; })[0];
        if (ca && ca.text) {
          navigator.clipboard.writeText(ca.text).catch(function() {});
        }
      } else if (action === 'inject-anchor' && id) {
        var ia = window.__ca.storage.getAll().filter(function(x) { return x.id === id; })[0];
        if (ia && ia.text && window.__ca.content) {
          window.__ca.content.injectAnchorToPrompt(ia);
        }
      } else if (action === 'clear-expired') {
        renderConfirmDialog('Clear all expired anchors?', function() {
          window.__ca.storage.clearExpired();
          window.__ca.events.emit('anchors:changed');
        });
      } else if (action === 'edit-anchor' && id) {
        var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (anchor) renderEditorOverlay('anchor', anchor);
      } else if (action === 'extend-turns' && id) {
        window.__ca.storage.extendTurns(id, 5);
        window.__ca.events.emit('anchors:changed');
        showBulkToast('Extended +5 turns');
      } else if (action === 'filter-tag') {
        var tag = target.dataset.tag;
        if (tag) {
          currentSearch = '#' + tag;
          currentFilter = 'all';
          var searchInput = window.__ca.shared.$one('.ca-search-input');
          if (searchInput) searchInput.value = '#' + tag;
          updateAnchorList();
        }
      } else if (action === 'rename-tag') {
        var oldTag = target.dataset.tag;
        if (oldTag) {
          var newName = prompt('Rename "' + oldTag + '" to:', oldTag);
          if (newName && newName.trim() && newName.trim() !== oldTag) {
            newName = newName.trim();
            var allTags = window.__ca.storage.getTags();
            if (allTags.indexOf(newName) !== -1) {
              if (confirm('Tag "' + newName + '" already exists. Click OK to merge "' + oldTag + '" into it (all uses replaced). Cancel to keep both.')) {
                window.__ca.storage.mergeTags(oldTag, newName);
              } else {
                return;
              }
            } else {
              window.__ca.storage.renameTag(oldTag, newName);
            }
            window.__ca.events.emit('anchors:changed');
            updateAnchorList();
            updateTemplateList();
          }
        }
      } else if (action === 'expand-text' && id) {
        var textEl = target;
        textEl.classList.toggle('expanded');
      } else if (action === 'export-all') {
        var filterIds = (_bulkState().enabled && _bulkState().selectedIds.length > 0) ? _bulkState().selectedIds : null;
        exportAll(filterIds);
      } else if (action === 'export-all-templates') {
        var allT = window.__ca.storage.getTemplates();
        downloadJSON(allT, 'ca-templates-' + Date.now() + '.json');
      } else if (action === 'export-all-bundles') {
        var allB = window.__ca.storage.getBundles();
        var exportBundles = [];
        for (var bi = 0; bi < allB.length; bi++) {
          var eb = allB[bi];
          var memberAnchors = [];
          for (var ai = 0; ai < eb.anchorIds.length; ai++) {
            var ma = window.__ca.storage.getById(eb.anchorIds[ai]);
            if (ma) memberAnchors.push(ma);
          }
          exportBundles.push({ bundle: eb, anchors: memberAnchors });
        }
        downloadJSON(exportBundles, 'ca-bundles-' + Date.now() + '.json');
      } else if (action === 'export-all-constraints') {
        var allC = window.__ca.storage.getAllConstraints();
        downloadJSON(allC, 'ca-constraints-' + Date.now() + '.json');
      } else if (action === 'export-anchor' && id) {
        var ea = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (ea) downloadJSON([ea], 'ca-anchor-' + Date.now() + '.json');
      } else if (action === 'export-template' && id) {
        var et = window.__ca.storage.getTemplates().filter(function(t) { return t.id === id; })[0];
        if (et) downloadJSON([et], 'ca-template-' + Date.now() + '.json');
      } else if (action === 'export-bundle' && id) {
        var eb = window.__ca.storage.getBundles().filter(function(b) { return b.id === id; })[0];
        if (eb) {
          var memberAnchors = [];
          for (var ai = 0; ai < eb.anchorIds.length; ai++) {
            var ma = window.__ca.storage.getById(eb.anchorIds[ai]);
            if (ma) memberAnchors.push(ma);
          }
          downloadJSON({ anchors: memberAnchors, bundles: [eb] }, 'ca-bundle-' + Date.now() + '.json');
        }
      } else if (action === 'import-all') {
        var fileInput = window.__ca.shared.$one('.ca-import-input');
        if (fileInput) fileInput.click();
      } else if (action === 'export-anchors') {
        exportAnchors();
      } else if (action === 'import-templates') {
        var tplInput = window.__ca.shared.$one('[data-action="import-templates-file"]');
        if (tplInput) tplInput.click();
      } else if (action === 'import-bundles') {
        var bunInput = window.__ca.shared.$one('[data-action="import-bundles-file"]');
        if (bunInput) bunInput.click();
      } else if (action === 'import-constraints') {
        var conInput = window.__ca.shared.$one('[data-action="import-constraints-file"]');
        if (conInput) conInput.click();
      } else if (action === 'import-anchors') {
        var fileInput = window.__ca.shared.$one('.ca-import-input');
        if (fileInput) fileInput.click();
      } else if (action === 'toggle-template-active' && id) {
        window.__ca.storage.toggleTemplateActive(id);
        window.__ca.events.emit('anchors:changed');
      } else if (action === 'activate-template' && id) {
        window.__ca.storage.activateTemplate(id, window.location.href);
        window.__ca.events.emit('anchors:changed');
      } else if (action === 'edit-template' && id) {
        var tpl = window.__ca.storage.getTemplates().filter(function(t) { return t.id === id; })[0];
        if (tpl) renderEditorOverlay('template', tpl);
      } else if (action === 'delete-template' && id) {
        renderConfirmDialog('Delete this template?', function() {
          window.__ca.storage.deleteTemplate(id);
          updateTemplateList();
        });
      } else if (action === 'restore-template' && id) {
        window.__ca.storage.restoreTemplate(id);
        updateTemplateList();
      } else if (action === 'purge-template' && id) {
        renderConfirmDialog('Permanently delete this template?', function() {
          window.__ca.storage.permanentDeleteTemplate(id);
          updateTemplateList();
        });
      } else if (action === 'copy-template' && id) {
        var ct = window.__ca.storage.getTemplates().filter(function(t) { return t.id === id; })[0];
        if (ct && ct.text) {
          navigator.clipboard.writeText(ct.text).catch(function() {});
        }
      } else if (action === 'inject-template' && id) {
        var it = window.__ca.storage.getTemplates().filter(function(t) { return t.id === id; })[0];
        if (it && it.text && window.__ca.content) {
          window.__ca.content.injectTextToPrompt(it.text);
        }
      } else if (action === 'add-template') {
        var tpl = window.__ca.storage.createTemplate('New Template', '', []);
        renderEditorOverlay('template', tpl);
      } else if (action === 'toggle-all-templates') {
        var allTpls = window.__ca.storage.getTemplates();
        var tplIds = [];
        for (var ti = 0; ti < allTpls.length; ti++) {
          if (!allTpls[ti].deleted) tplIds.push(allTpls[ti].id);
        }
        window.__ca.storage.bulkToggleTemplateActive(tplIds);
        window.__ca.events.emit('anchors:changed');
      } else if (action === 'add-bundle') {
        renderBundleCreator();
      } else if (action === 'delete-bundle' && id) {
        renderConfirmDialog('Delete this bundle? (Anchors are not deleted)', function() {
          window.__ca.storage.deleteBundle(id);
          updateBundleList();
        });
      } else if (action === 'restore-bundle' && id) {
        window.__ca.storage.restoreBundle(id);
        updateBundleList();
      } else if (action === 'purge-bundle' && id) {
        renderConfirmDialog('Permanently delete this bundle?', function() {
          window.__ca.storage.permanentDeleteBundle(id);
          updateBundleList();
        });
      } else if (action === 'edit-bundle' && id) {
        var eb = window.__ca.storage.getBundles().filter(function(b) { return b.id === id; })[0];
        if (eb) renderBundleCreator(eb);
      } else if (action === 'toggle-bundle' && id) {
        window.__ca.storage.activateBundleExclusively(id);
        window.__ca.events.emit('anchors:changed');
        updateBundleList();
      } else if (action === 'inject-all-bundle' && id) {
        var iab = window.__ca.storage.getBundles().filter(function(b) { return b.id === id; })[0];
        if (iab && window.__ca.content) {
          var texts = [];
          for (var ai = 0; ai < iab.anchorIds.length; ai++) {
            var ia = window.__ca.storage.getById(iab.anchorIds[ai]);
            if (ia && window.__ca.content.filterByScope([ia]).length) texts.push(ia.text);
          }
          if (texts.length > 0) window.__ca.content.injectTextToPrompt(texts.join('\n\n'));
        }
      } else if (action === 'deactivate-all-bundles') {
        window.__ca.storage.deactivateAllBundles();
        window.__ca.events.emit('anchors:changed');
        updateBundleList();
      } else if (action === 'pin-constraint' && id) {
        window.__ca.storage.toggleConstraint(id);
        window.__ca.events.emit('constraints:changed');
      } else if (action === 'toggle-all-constraints') {
        var allCons = window.__ca.storage.getAllConstraints();
        var conIds = [];
        for (var ci = 0; ci < allCons.length; ci++) {
          if (!allCons[ci].deleted) conIds.push(allCons[ci].id);
        }
        window.__ca.storage.bulkToggleConstraints(conIds);
        window.__ca.events.emit('constraints:changed');
      } else if (action === 'add-constraint') {
        renderConstraintEditor(null);
      } else if (action === 'edit-constraint' && id) {
        var con = window.__ca.storage.getConstraintById(id);
        if (con) renderConstraintEditor(con);
      } else if (action === 'delete-constraint' && id) {
        renderConfirmDialog('Delete this constraint?', function() {
          window.__ca.storage.deleteConstraint(id);
          window.__ca.events.emit('constraints:changed');
        });
      } else if (action === 'restore-constraint' && id) {
        window.__ca.storage.restoreConstraint(id);
        window.__ca.events.emit('constraints:changed');
      } else if (action === 'purge-constraint' && id) {
        renderConfirmDialog('Permanently delete this constraint?', function() {
          window.__ca.storage.permanentDeleteConstraint(id);
          window.__ca.events.emit('constraints:changed');
        });
      } else if (action === 'toggle-bulk') {
        toggleBulk();
      } else if (action === 'bulk-select' && id) {
        var idx = _bulkState().selectedIds.indexOf(id);
        if (idx === -1) {
          _bulkState().selectedIds.push(id);
        } else {
          _bulkState().selectedIds.splice(idx, 1);
        }
        if (currentTab === 'anchors') updateAnchorList();
        else if (currentTab === 'templates') updateTemplateList();
        else if (currentTab === 'bundles') updateBundleList();
        else if (currentTab === 'constraints') updateConstraintList();
        updateBulkBar();
      } else if (action === 'bulk-toggle') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggle(_bulkState().selectedIds);
          window.__ca.events.emit('anchors:changed');
          showBulkToast(_bulkState().selectedIds.length + ' anchor' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' toggled');
        }
      } else if (action === 'bulk-extend') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkExtend(_bulkState().selectedIds, 5);
          window.__ca.events.emit('anchors:changed');
          showBulkToast(_bulkState().selectedIds.length + ' anchor' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' extended (+5)');
        }
      } else if (action === 'bulk-add-tag') {
        if (_bulkState().selectedIds.length > 0) {
          renderBulkTagDialog(function(selectedTags) {
            for (var ti = 0; ti < selectedTags.length; ti++) {
              window.__ca.storage.addBulkTag(_bulkState().selectedIds, selectedTags[ti]);
            }
            window.__ca.events.emit('anchors:changed');
            showBulkToast(selectedTags.length + ' tag' + (selectedTags.length > 1 ? 's' : '') + ' added to ' + _bulkState().selectedIds.length + ' item' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
          }, 'add');
        }
      } else if (action === 'bulk-remove-tag') {
        if (_bulkState().selectedIds.length > 0) {
          renderBulkTagDialog(function(selectedTags) {
            for (var ti = 0; ti < selectedTags.length; ti++) {
              window.__ca.storage.removeBulkTag(_bulkState().selectedIds, selectedTags[ti]);
            }
            window.__ca.events.emit('anchors:changed');
            showBulkToast(selectedTags.length + ' tag' + (selectedTags.length > 1 ? 's' : '') + ' removed from ' + _bulkState().selectedIds.length + ' item' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
          }, 'remove');
        }
      } else if (action === 'bulk-set-ttl') {
        if (_bulkState().selectedIds.length > 0) {
          renderBulkTTLDialog(function(minutes) {
            window.__ca.storage.bulkSetTTL(_bulkState().selectedIds, minutes);
            window.__ca.events.emit('anchors:changed');
            showBulkToast('TTL ' + (minutes ? 'set to ' + window.__ca.shared.formatTTL(minutes) : 'cleared') + ' for ' + _bulkState().selectedIds.length + ' anchor' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
          });
        }
      } else if (action === 'bulk-toggle-global') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggleGlobal(_bulkState().selectedIds);
          window.__ca.events.emit('anchors:changed');
          showBulkToast('Global scope toggled for ' + _bulkState().selectedIds.length + ' anchor' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
        }
      } else if (action === 'bulk-select-all') {
        var currentItems = getCurrentFilteredItems();
        _bulkState().selectedIds = currentItems.map(function(item) { return item.id; });
        updateCurrentList();
        updateBulkBar();
      } else if (action === 'bulk-select-none') {
        _bulkState().selectedIds = [];
        updateCurrentList();
        updateBulkBar();
      } else if (action === 'bulk-select-invert') {
        var currentItems = getCurrentFilteredItems();
        var currentSet = {};
        for (var si = 0; si < _bulkState().selectedIds.length; si++) currentSet[_bulkState().selectedIds[si]] = true;
        _bulkState().selectedIds = [];
        for (var si = 0; si < currentItems.length; si++) {
          if (!currentSet[currentItems[si].id]) _bulkState().selectedIds.push(currentItems[si].id);
        }
        updateCurrentList();
        updateBulkBar();
      } else if (action === 'bulk-export-anchors') {
        var srcAnchors = currentFilter === 'deleted' ? window.__ca.storage.getSoftDeleted('anchors') : window.__ca.storage.getAll();
        var exportAnchors = srcAnchors.filter(function(a) { return _bulkState().selectedIds.indexOf(a.id) !== -1; });
        if (exportAnchors.length > 0) downloadJSON(exportAnchors, 'ca-anchors-' + Date.now() + '.json');
      } else if (action === 'bulk-toggle-template-active') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggleTemplateActive(_bulkState().selectedIds);
          window.__ca.events.emit('anchors:changed');
          showBulkToast(_bulkState().selectedIds.length + ' template' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' toggled');
          updateTemplateList();
        }
      } else if (action === 'bulk-set-template-ttl') {
        if (_bulkState().selectedIds.length > 0) {
          renderBulkTTLDialog(function(minutes) {
            window.__ca.storage.bulkSetTemplateTTL(_bulkState().selectedIds, minutes);
            window.__ca.events.emit('anchors:changed');
            showBulkToast('TTL ' + (minutes ? 'set to ' + window.__ca.shared.formatTTL(minutes) : 'cleared') + ' for ' + _bulkState().selectedIds.length + ' template' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
          });
        }
      } else if (action === 'bulk-toggle-members') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggleMembers(_bulkState().selectedIds);
          window.__ca.events.emit('anchors:changed');
          showBulkToast('Toggled members of ' + _bulkState().selectedIds.length + ' bundle' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
        }
      } else if (action === 'bulk-extend-members') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkExtendMembers(_bulkState().selectedIds, 5);
          window.__ca.events.emit('anchors:changed');
          showBulkToast('Extended members of ' + _bulkState().selectedIds.length + ' bundle' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' (+5)');
        }
      } else if (action === 'bulk-set-members-ttl') {
        if (_bulkState().selectedIds.length > 0) {
          renderBulkTTLDialog(function(minutes) {
            window.__ca.storage.bulkSetMembersTTL(_bulkState().selectedIds, minutes);
            window.__ca.events.emit('anchors:changed');
            showBulkToast('TTL set on members of ' + _bulkState().selectedIds.length + ' bundle' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
          });
        }
      } else if (action === 'bulk-delete') {
        var count = _bulkState().selectedIds.length;
        var deletedIds = _bulkState().selectedIds.slice();
        if (currentFilter === 'deleted') {
          renderConfirmDialog('Permanently delete ' + count + ' selected anchor' + (count > 1 ? 's' : '') + '? This cannot be undone.', function() {
            window.__ca.storage.bulkPermanentDelete(deletedIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateBulkBar();
            showBulkToast(count + ' anchor' + (count > 1 ? 's' : '') + ' permanently deleted');
          });
        } else {
          renderConfirmDialog('Delete ' + count + ' selected anchor' + (count > 1 ? 's' : '') + '?', function() {
            window.__ca.storage.bulkDelete(deletedIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateBulkBar();
            showUndoableBulkToast(count + ' anchor' + (count > 1 ? 's' : '') + ' deleted', function() {
              window.__ca.storage.bulkRestoreAnchors(deletedIds);
              window.__ca.events.emit('anchors:changed');
            });
          });
        }
      } else if (action === 'bulk-restore') {
        if (_bulkState().selectedIds.length > 0) {
          var deletedAnchors = window.__ca.storage.getSoftDeleted('anchors');
          var deletedIds = _bulkState().selectedIds.filter(function(id) {
            return deletedAnchors.some(function(a) { return a.id === id; });
          });
          if (deletedIds.length > 0) {
            window.__ca.storage.bulkRestoreAnchors(deletedIds);
            window.__ca.events.emit('anchors:changed');
            showBulkToast(deletedIds.length + ' anchor' + (deletedIds.length > 1 ? 's' : '') + ' restored');
          }
        }
      } else if (action === 'bulk-activate-templates') {
        for (var ti = 0; ti < _bulkState().selectedIds.length; ti++) {
          window.__ca.storage.activateTemplate(_bulkState().selectedIds[ti], window.location.href);
        }
        window.__ca.events.emit('anchors:changed');
        showBulkToast(_bulkState().selectedIds.length + ' template' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' activated');
        updateTemplateList();
      } else if (action === 'bulk-delete-templates') {
        var tplCount = _bulkState().selectedIds.length;
        if (tplCount === 0) return;
        var tplIds = _bulkState().selectedIds.slice();
        if (currentTemplateFilter === 'deleted') {
          renderConfirmDialog('Permanently delete ' + tplCount + ' selected template' + (tplCount > 1 ? 's' : '') + '? This cannot be undone.', function() {
            window.__ca.storage.bulkPermanentDeleteTemplates(tplIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateTemplateList();
            updateBulkBar();
            showBulkToast(tplCount + ' template' + (tplCount > 1 ? 's' : '') + ' permanently deleted');
          });
        } else {
          renderConfirmDialog('Delete ' + tplCount + ' selected template' + (tplCount > 1 ? 's' : '') + '?', function() {
            window.__ca.storage.bulkDeleteTemplates(tplIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateTemplateList();
            updateBulkBar();
          });
        }
      } else if (action === 'bulk-restore-templates') {
        if (_bulkState().selectedIds.length > 0) {
          var deletedTemplates = window.__ca.storage.getSoftDeleted('templates');
          var deletedIds = _bulkState().selectedIds.filter(function(id) {
            return deletedTemplates.some(function(t) { return t.id === id; });
          });
          if (deletedIds.length > 0) {
            window.__ca.storage.bulkRestoreTemplates(deletedIds);
            window.__ca.events.emit('anchors:changed');
            showBulkToast(deletedIds.length + ' template' + (deletedIds.length > 1 ? 's' : '') + ' restored');
          }
        }
      } else if (action === 'bulk-delete-bundles') {
        var bunCount = _bulkState().selectedIds.length;
        if (bunCount === 0) return;
        var bunIds = _bulkState().selectedIds.slice();
        if (currentBundleFilter === 'deleted') {
          renderConfirmDialog('Permanently delete ' + bunCount + ' selected bundle' + (bunCount > 1 ? 's' : '') + '? This cannot be undone.', function() {
            window.__ca.storage.bulkPermanentDeleteBundles(bunIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateBundleList();
            updateBulkBar();
            showBulkToast(bunCount + ' bundle' + (bunCount > 1 ? 's' : '') + ' permanently deleted');
          });
        } else {
          renderConfirmDialog('Delete ' + bunCount + ' selected bundle' + (bunCount > 1 ? 's' : '') + '? (Anchors are not deleted)', function() {
            window.__ca.storage.bulkDeleteBundles(bunIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('anchors:changed');
            updateBundleList();
            updateBulkBar();
          });
        }
      } else if (action === 'bulk-restore-bundles') {
        if (_bulkState().selectedIds.length > 0) {
          var deletedBundles = window.__ca.storage.getSoftDeleted('bundles');
          var deletedIds = _bulkState().selectedIds.filter(function(id) {
            return deletedBundles.some(function(b) { return b.id === id; });
          });
          if (deletedIds.length > 0) {
            window.__ca.storage.bulkRestoreBundles(deletedIds);
            window.__ca.events.emit('anchors:changed');
            showBulkToast(deletedIds.length + ' bundle' + (deletedIds.length > 1 ? 's' : '') + ' restored');
          }
        }
      } else if (action === 'bulk-export-templates') {
        var srcTemplates = currentTemplateFilter === 'deleted' ? window.__ca.storage.getSoftDeleted('templates') : window.__ca.storage.getTemplates();
        var et = srcTemplates.filter(function(t) { return _bulkState().selectedIds.indexOf(t.id) !== -1; });
        if (et.length > 0) downloadJSON(et, 'ca-templates-' + Date.now() + '.json');
      } else if (action === 'bulk-export-bundles') {
        var srcBundles = currentBundleFilter === 'deleted' ? window.__ca.storage.getSoftDeleted('bundles') : window.__ca.storage.getBundles();
        var eb = srcBundles.filter(function(b) { return _bulkState().selectedIds.indexOf(b.id) !== -1; });
        if (eb.length > 0) {
          var expB = [];
          for (var bi = 0; bi < eb.length; bi++) {
            var memberA = [];
            for (var ai = 0; ai < eb[bi].anchorIds.length; ai++) {
              var ma = window.__ca.storage.getById(eb[bi].anchorIds[ai]);
              if (ma) memberA.push(ma);
            }
            expB.push({ bundle: eb[bi], anchors: memberA });
          }
          downloadJSON(expB, 'ca-bundles-' + Date.now() + '.json');
        }
      } else if (action === 'bulk-export-constraints') {
        var srcConstraints = currentConstraintFilter === 'deleted' ? window.__ca.storage.getSoftDeleted('constraints') : window.__ca.storage.getAllConstraints();
        var ec = srcConstraints.filter(function(c) { return _bulkState().selectedIds.indexOf(c.id) !== -1; });
        if (ec.length > 0) downloadJSON(ec, 'ca-constraints-' + Date.now() + '.json');
      } else if (action === 'bulk-toggle-constraints') {
        if (_bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggleConstraints(_bulkState().selectedIds);
          window.__ca.events.emit('constraints:changed');
          showBulkToast(_bulkState().selectedIds.length + ' constraint' + (_bulkState().selectedIds.length > 1 ? 's' : '') + ' toggled');
        }
      } else if (action === 'bulk-delete-constraints') {
        var cc = _bulkState().selectedIds.length;
        if (cc === 0) return;
        var deletedConstraintIds = _bulkState().selectedIds.slice();
        if (currentConstraintFilter === 'deleted') {
          renderConfirmDialog('Permanently delete ' + cc + ' selected constraint' + (cc > 1 ? 's' : '') + '? This cannot be undone.', function() {
            window.__ca.storage.bulkPermanentDeleteConstraints(deletedConstraintIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('constraints:changed');
            updateBulkBar();
            showBulkToast(cc + ' constraint' + (cc > 1 ? 's' : '') + ' permanently deleted');
          });
        } else {
          renderConfirmDialog('Delete ' + cc + ' selected constraint' + (cc > 1 ? 's' : '') + '?', function() {
            window.__ca.storage.bulkDeleteConstraints(deletedConstraintIds);
            _bulkState().selectedIds = [];
            window.__ca.events.emit('constraints:changed');
            updateBulkBar();
          });
        }
      } else if (action === 'bulk-restore-constraints') {
        if (_bulkState().selectedIds.length > 0) {
          var deletedConstraints = window.__ca.storage.getSoftDeleted('constraints');
          var deletedIds = _bulkState().selectedIds.filter(function(id) {
            return deletedConstraints.some(function(c) { return c.id === id; });
          });
          if (deletedIds.length > 0) {
            window.__ca.storage.bulkRestoreConstraints(deletedIds);
            window.__ca.events.emit('constraints:changed');
            showBulkToast(deletedIds.length + ' constraint' + (deletedIds.length > 1 ? 's' : '') + ' restored');
          }
        }
      } else if (action === 'cycle-inject-mode') {
        var current = window.__ca.storage.getInjectionMode();
        var modes = ['prepend', 'append', 'intermittent'];
        var idx = modes.indexOf(current);
        var next = modes[(idx + 1) % modes.length];
        window.__ca.storage.setInjectionMode(next);
    updateInjectModeLabel();
    updateInlineSlashLabel();
      } else if (action === 'toggle-global' && id) {
        var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (anchor) {
          var next = !anchor.global;
          window.__ca.storage.setGlobal(id, next);
          window.__ca.events.emit('anchors:changed');
          showBulkToast(next ? 'Global enabled' : 'Global disabled');
        }
      } else if (action === 'confirm-cancel') {
        removeConfirmDialog();
      } else if (action === 'confirm-ok') {
        removeConfirmDialog();
      } else if (action === 'toggle-panel-group' && target.dataset.group) {
        var gkey = target.dataset.group;
        collapsedPanelGroups[gkey] = !collapsedPanelGroups[gkey];
        updateAnchorList();
      } else if (action === 'toggle-template-group' && target.dataset.group) {
        var tgkey = target.dataset.group;
        collapsedTemplateGroups[tgkey] = !collapsedTemplateGroups[tgkey];
        updateTemplateList();
      } else if (action === 'open-timeline') {
        if (window.__ca.timeline && window.__ca.timeline.renderTimelineOverlay) window.__ca.timeline.renderTimelineOverlay();
      } else if (action === 'open-playground') {
        if (window.__ca.simulator && window.__ca.simulator.open) window.__ca.simulator.open();
      } else if (action === 'open-help-guide') {
        openHelpGuide();
      } else if (action === 'toggle-lock') {
        panelLocked = !panelLocked;
        var lockBtn = window.__ca.shared.$one('.ca-btn-lock');
        if (lockBtn) {
          lockBtn.className = 'ca-btn-icon ca-btn-lock' + (panelLocked ? ' locked' : '');
          var lockSvg = lockBtn.querySelector('svg');
          if (lockSvg) {
            lockSvg.setAttribute('viewBox', '0 0 24 24');
            lockSvg.setAttribute('fill', 'none');
            lockSvg.setAttribute('stroke', 'currentColor');
            lockSvg.setAttribute('stroke-width', '2');
            while (lockSvg.firstChild) lockSvg.removeChild(lockSvg.firstChild);
            if (panelLocked) {
              var lockedRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              lockedRect.setAttribute('x', '3');
              lockedRect.setAttribute('y', '11');
              lockedRect.setAttribute('width', '18');
              lockedRect.setAttribute('height', '11');
              lockedRect.setAttribute('rx', '2');
              lockedRect.setAttribute('fill', 'currentColor');
              var lockedPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              lockedPath.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
              lockSvg.appendChild(lockedRect);
              lockSvg.appendChild(lockedPath);
            } else {
              var openRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              openRect.setAttribute('x', '3');
              openRect.setAttribute('y', '11');
              openRect.setAttribute('width', '18');
              openRect.setAttribute('height', '11');
              openRect.setAttribute('rx', '2');
              var openPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              openPath.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
              lockSvg.appendChild(openRect);
              lockSvg.appendChild(openPath);
            }
          }
        }
        if (panelLocked) {
          panel.classList.add('locked');
        } else {
          panel.classList.remove('locked');
        }
        /* Sync minimal lock button state */
        var minLock = window.__ca.shared.$one('.ca-minimal-lock');
        if (minLock) {
          minLock.classList.toggle('locked', panelLocked);
          minLock.setAttribute('aria-label', panelLocked ? 'Unlock panel' : 'Lock panel');
        }
      } else if (action === 'toggle-panel-mode') {
        panel.classList.toggle('minimal');
        if (panel.classList.contains('minimal') && _bulkState().enabled) {
          toggleBulk();
        }
        var modeBtns = window.__ca.ROOT.querySelectorAll('.ca-btn-mode-toggle');
        var isMinimal = panel.classList.contains('minimal');
        for (var mi = 0; mi < modeBtns.length; mi++) {
          modeBtns[mi].setAttribute('aria-label', isMinimal ? 'Switch to full' : 'Switch to minimal');
        }
        updateAnchorList();
      } else if (action === 'toggle-minimal-tools') {
        panel.classList.toggle('show-tools');
      } else if (action === 'toggle-inline-slash') {
        var current = window.__ca.storage.getSetting('inlineSlash');
        window.__ca.storage.setSetting('inlineSlash', !current);
        updateInlineSlashLabel();
      }
    });

    panel.addEventListener('input', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      if (target.dataset.action === 'search') {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(function() {
          currentSearch = target.value.trim();
          updateAnchorList();
        }, 300);
      } else if (target.dataset.action === 'search-templates') {
        clearTimeout(templateSearchTimer);
        templateSearchTimer = setTimeout(function() {
          currentTemplateSearch = target.value.trim();
          updateTemplateList();
        }, 300);
      } else if (target.dataset.action === 'search-bundles') {
        clearTimeout(bundleSearchTimer);
        bundleSearchTimer = setTimeout(function() {
          currentBundleSearch = target.value.trim();
          updateBundleList();
        }, 300);
      } else if (target.dataset.action === 'search-constraints') {
        clearTimeout(constraintSearchTimer);
        constraintSearchTimer = setTimeout(function() {
          currentConstraintSearch = target.value.trim();
          updateConstraintList();
        }, 300);
      }
    });

    panel.addEventListener('change', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      if (target.dataset.action === 'filter-status') {
        currentFilter = target.value;
        updateAnchorList();
      } else if (target.dataset.action === 'filter-templates') {
        currentTemplateFilter = target.value;
        updateTemplateList();
      } else if (target.dataset.action === 'filter-bundles') {
        currentBundleFilter = target.value;
        updateBundleList();
      } else if (target.dataset.action === 'import-file') {
        importAll(target);
      } else if (target.dataset.action === 'import-templates-file') {
        importTemplates(target);
      } else if (target.dataset.action === 'import-bundles-file') {
        importBundles(target);
      } else if (target.dataset.action === 'import-constraints-file') {
        importConstraints(target);
      } else if (target.dataset.action === 'import-profiles-file') {
        importProfiles(target);
      } else if (target.dataset.action === 'sort-anchors') {
        currentSort = target.value;
        updateAnchorList();
      } else if (target.dataset.action === 'group-anchors') {
        currentPanelGroup = target.value;
        updateAnchorList();
      } else if (target.dataset.action === 'sort-templates') {
        currentTemplateSort = target.value;
        updateTemplateList();
      } else if (target.dataset.action === 'group-templates') {
        currentTemplateGroup = target.value;
        updateTemplateList();
      } else if (target.dataset.action === 'sort-bundles') {
        currentBundleSort = target.value;
        updateBundleList();
      } else if (target.dataset.action === 'filter-constraints') {
        currentConstraintFilter = target.value;
        updateConstraintList();
      } else if (target.dataset.action === 'sort-constraints') {
        currentConstraintSort = target.value;
        updateConstraintList();
      } else if (target.dataset.action === 'bulk-set-priority') {
        if (_bulkState().selectedIds.length > 0 && target.value) {
          var prio = target.value;
          target.value = '';
          window.__ca.storage.bulkSetConstraintPriority(_bulkState().selectedIds, prio);
          window.__ca.events.emit('constraints:changed');
          showBulkToast('Priority set to ' + prio + ' for ' + _bulkState().selectedIds.length + ' constraint' + (_bulkState().selectedIds.length > 1 ? 's' : ''));
        }
      }
    });

    panel.addEventListener('keydown', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      if (e.key === 'Enter') {
        if (target.dataset.action === 'search') {
          e.preventDefault();
          clearTimeout(searchDebounceTimer);
          currentSearch = target.value.trim();
          updateAnchorList();
          return;
        }
        if (target.dataset.action === 'search-templates') {
          e.preventDefault();
          clearTimeout(templateSearchTimer);
          currentTemplateSearch = target.value.trim();
          updateTemplateList();
          return;
        }
        if (target.dataset.action === 'search-bundles') {
          e.preventDefault();
          clearTimeout(bundleSearchTimer);
          currentBundleSearch = target.value.trim();
          updateBundleList();
          return;
        }
        if (target.dataset.action === 'search-constraints') {
          e.preventDefault();
          clearTimeout(constraintSearchTimer);
          currentConstraintSearch = target.value.trim();
          updateConstraintList();
          return;
        }
      }

      if (target.dataset.action === 'search' && e.key === 'Escape') {
        target.value = '';
        currentSearch = '';
        updateAnchorList();
        target.blur();
      }
      if (target.dataset.action === 'search-templates' && e.key === 'Escape') {
        target.value = '';
        currentTemplateSearch = '';
        updateTemplateList();
        target.blur();
      }
      if (target.dataset.action === 'search-bundles' && e.key === 'Escape') {
        target.value = '';
        currentBundleSearch = '';
        updateBundleList();
        target.blur();
      }
      if (target.dataset.action === 'search-constraints' && e.key === 'Escape') {
        target.value = '';
        currentConstraintSearch = '';
        updateConstraintList();
        target.blur();
      }

      var isTagInput = e.target.classList.contains('ca-tag-input-field')
        || e.target.classList.contains('ca-editor-tag-input');
    if (isTagInput && e.key === 'Enter') {
        e.preventDefault();
        var id = e.target.dataset.id;
        var tag = e.target.value.trim();
        if (tag && id) {
          window.__ca.storage.addTag(id, tag);
          e.target.value = '';
          window.__ca.events.emit('anchors:changed');
        }
      }
    });

    var anchorList = window.__ca.shared.$id('ca-anchor-list');
    if (anchorList) {
      var dragSrcId = null;

      anchorList.addEventListener('dragstart', function(e) {
        var item = e.target.closest('.ca-anchor-item');
        if (!item) return;
        dragSrcId = item.dataset.id;
        item.classList.add('dragging');
        panel.classList.add('ca-dragging');
      });

      anchorList.addEventListener('dragend', function(e) {
        var items = anchorList.querySelectorAll('.ca-anchor-item');
        for (var di = 0; di < items.length; di++) {
          items[di].classList.remove('dragging', 'drag-over');
        }
        dragSrcId = null;
        panel.classList.remove('ca-dragging');
      });

      anchorList.addEventListener('dragover', function(e) {
        e.preventDefault();
        var item = e.target.closest('.ca-anchor-item');
        if (!item || item.dataset.id === dragSrcId) return;
        var items = anchorList.querySelectorAll('.ca-anchor-item');
        for (var di = 0; di < items.length; di++) {
          items[di].classList.remove('drag-over');
        }
        item.classList.add('drag-over');
      });

      anchorList.addEventListener('drop', function(e) {
        e.preventDefault();
        var item = e.target.closest('.ca-anchor-item');
        if (!item || !dragSrcId || item.dataset.id === dragSrcId) return;
        var anchors = window.__ca.storage.getAll();
        var srcIdx = -1;
        var dstIdx = -1;
        for (var di = 0; di < anchors.length; di++) {
          if (anchors[di].id === dragSrcId) srcIdx = di;
          if (anchors[di].id === item.dataset.id) dstIdx = di;
        }
        if (srcIdx === -1 || dstIdx === -1) return;
        var srcOrder = anchors[srcIdx].order;
        anchors[srcIdx].order = anchors[dstIdx].order;
        anchors[dstIdx].order = srcOrder;
        window.__ca.storage.updateAnchor(anchors[srcIdx].id, { order: anchors[srcIdx].order });
        window.__ca.storage.updateAnchor(anchors[dstIdx].id, { order: anchors[dstIdx].order });
        window.__ca.events.emit('anchors:changed');
        dragSrcId = null;
        panel.classList.remove('ca-dragging');
      });
    }
  }

  function downloadJSON(data, filename) {
    var meta = window.__ca.shared.buildExportMeta();
    var payload;
    if (Array.isArray(data)) {
      payload = { metadata: meta, items: data };
    } else {
      if (data._ca_meta) {
        payload = data;
      } else {
        payload = {};
        for (var k in data) {
          if (data.hasOwnProperty(k)) payload[k] = data[k];
        }
        payload.metadata = meta;
      }
    }
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAll() {
    var allAnchors = window.__ca.storage.getAll();
    var allTemplates = window.__ca.storage.getTemplates();
    var allBundles = window.__ca.storage.getBundles();
    var allConstraints = window.__ca.storage.getAllConstraints();

    if (_bulkState().selectedIds && _bulkState().selectedIds.length > 0) {
      allAnchors = allAnchors.filter(function(a) { return _bulkState().selectedIds.indexOf(a.id) !== -1; });
      allBundles = allBundles.filter(function(b) { return _bulkState().selectedIds.indexOf(b.id) !== -1; });
    }

      var heatmapData = window.__ca.storage.getUsageHeatmap();
      var analyticsData = window.__ca.state && window.__ca.state.analytics ? window.__ca.state.analytics : null;
      downloadJSON({ anchors: allAnchors, templates: allTemplates, bundles: allBundles, constraints: allConstraints, heatmap: heatmapData, analytics: analyticsData }, 'ca-backup-' + Date.now() + '.json');
  }

  function exportProfiles() {
    var profiles = window.__ca.storage.getAllProfiles();
    var activeProfile = window.__ca.storage.getActiveProfile();
    downloadJSON({
      profiles: profiles,
      activeProfileId: activeProfile ? activeProfile.id : null
    }, 'ca-profiles-' + Date.now() + '.json');
  }

  function importProfiles(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || !Array.isArray(data.profiles)) {
          window.__ca.content.showToast('Invalid format: expected { profiles: [...] }', 'error');
          return;
        }
        var imported = 0;
        var activeId = data.activeProfileId || null;
        for (var i = 0; i < data.profiles.length; i++) {
          var p = data.profiles[i];
          if (!p || typeof p.name !== 'string') continue;
          var existingProfiles = window.__ca.storage.getAllProfiles();
          var exists = false;
          for (var ei = 0; ei < existingProfiles.length; ei++) {
            if (existingProfiles[ei].name === p.name) { exists = true; break; }
          }
          if (exists) continue;
          var config = p.promptAssembly || {};
          var newProfile = window.__ca.storage.createProfile(p.name, config);
          if (newProfile) {
            if (p.personaRole) window.__ca.storage.updateProfile(newProfile.id, { personaRole: p.personaRole });
            if (p.reasoningProtocol) window.__ca.storage.updateProfile(newProfile.id, { reasoningProtocol: p.reasoningProtocol });
            if (p.outputVerbosity) window.__ca.storage.updateProfile(newProfile.id, { outputVerbosity: p.outputVerbosity });
            if (p.outputFormatChoice) window.__ca.storage.updateProfile(newProfile.id, { outputFormatChoice: p.outputFormatChoice });
            if (p.thinkingEffort) window.__ca.storage.updateProfile(newProfile.id, { thinkingEffort: p.thinkingEffort });
            if (p.groundingMode) window.__ca.storage.updateProfile(newProfile.id, { groundingMode: p.groundingMode });
            imported++;
            if (activeId && data.profiles[i].id === activeId) {
              window.__ca.storage.setActiveProfile(newProfile.id);
            }
          }
        }
        window.__ca.content.loadActiveProfile();
        window.__ca.content.showToast('Imported ' + imported + ' profile' + (imported !== 1 ? 's' : ''), imported > 0 ? 'success' : 'info');
        flushBehaviorFields();
        if (behaviorSaveTimer) { clearTimeout(behaviorSaveTimer); behaviorSaveTimer = null; }
        renderBehaviorEditor();
      } catch (err) {
        window.__ca.content.showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function importAll(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || typeof data !== 'object') return;

        var currentSessionId = window.__ca.shared.extractGeminiSessionId();
        if (data.metadata && data.metadata.sessionId && currentSessionId && data.metadata.sessionId !== currentSessionId) {
          var mismatchUrl = data.metadata.sessionUrl || 'https://gemini.google.com/c/' + data.metadata.sessionId;
          var shortId = data.metadata.sessionId.substring(0, 10);
          renderMismatchDialog(
            'This data belongs to session ' + shortId + '..., not the current chat. Import here or navigate to the correct session?',
            function() {
              var payload = {};
              if (Array.isArray(data.anchors)) payload.anchors = data.anchors;
              if (Array.isArray(data.templates)) payload.templates = data.templates;
              if (Array.isArray(data.bundles)) payload.bundles = data.bundles;
              if (Array.isArray(data.constraints)) payload.constraints = data.constraints;
              if (data.heatmap && typeof data.heatmap === 'object') payload.heatmap = data.heatmap;
              payload.metadata = data.metadata;
              window.__ca.storage.stagePendingImport(payload, function(success) {
                if (success) window.location.href = mismatchUrl;
              });
            },
            function() {
              doImport(data);
            }
          );
          return;
        }

        doImport(data);
      } catch (err) {
        console.error('[CA] Import error:', err);
      }
    };

    function doImport(data) {
      try {
        var importedA = 0;
        var importedT = 0;
        var importedB = 0;
        var skippedA = 0;
        var duplicateA = 0;
        var skippedT = 0;
        var skippedB = 0;
        var idMap = {};

        if (Array.isArray(data.anchors)) {
          for (var i = 0; i < data.anchors.length; i++) {
            var anchor = data.anchors[i];
            if (!anchor || typeof anchor.text !== 'string') { skippedA++; continue; }
            var existing = window.__ca.storage.getAll().filter(function(a) { return a.text === anchor.text; });
            if (existing.length > 0) { duplicateA++; continue; }
            var newA = window.__ca.storage.createAnchor(anchor.text, anchor.sourceUrl, anchor.turnsTotal, anchor.global, {
              messageId: anchor.messageId || null,
              blockIndex: anchor.blockIndex != null ? anchor.blockIndex : null,
              msgIndex: anchor.msgIndex != null ? anchor.msgIndex : null,
              blockTextHash: anchor.blockTextHash || null,
              textOffset: anchor.textOffset != null ? anchor.textOffset : null
            });
            idMap[anchor.id] = newA.id;
            importedA++;
            var updates = {};
            if (typeof anchor.turnsRemaining === 'number') updates.turnsRemaining = anchor.turnsRemaining;
            if (typeof anchor.active === 'boolean') updates.active = anchor.active;
            if (anchor.description) updates.description = anchor.description;
            if (Array.isArray(anchor.usageHistory)) updates.usageHistory = anchor.usageHistory;
            if (typeof anchor.usageCount === 'number') updates.usageCount = anchor.usageCount;
            if (typeof anchor.lastUsed === 'number') updates.lastUsed = anchor.lastUsed;
            if (typeof anchor.ttlMinutes === 'number') updates.ttlMinutes = anchor.ttlMinutes;
            if (typeof anchor.ttlExpiresAt === 'number') updates.ttlExpiresAt = anchor.ttlExpiresAt;
            if (typeof anchor.originalTurns === 'number') updates.originalTurns = anchor.originalTurns;
            if (typeof anchor.totalTurnsConsumed === 'number') updates.totalTurnsConsumed = anchor.totalTurnsConsumed;
            if (anchor.toneProfile && typeof anchor.toneProfile === 'object') updates.toneProfile = anchor.toneProfile;
            if (Array.isArray(anchor.domainFocus) && anchor.domainFocus.length > 0) updates.domainFocus = anchor.domainFocus;
            if (typeof anchor.socraticTrigger === 'string' && anchor.socraticTrigger) updates.socraticTrigger = anchor.socraticTrigger;
            if (typeof anchor.uncertaintyProtocol === 'string' && anchor.uncertaintyProtocol) updates.uncertaintyProtocol = anchor.uncertaintyProtocol;
            if (anchor.outputRequirements && typeof anchor.outputRequirements === 'object') updates.outputRequirements = anchor.outputRequirements;
            window.__ca.storage.updateAnchor(newA.id, updates);
            if (Array.isArray(anchor.tags)) {
              for (var ti = 0; ti < anchor.tags.length; ti++) {
                window.__ca.storage.addTag(newA.id, anchor.tags[ti]);
              }
            }
            if (Array.isArray(anchor.triggerKeywords)) {
              for (var ki = 0; ki < anchor.triggerKeywords.length; ki++) {
                window.__ca.storage.addTriggerKeyword(newA.id, anchor.triggerKeywords[ki]);
              }
            }
          }
        }

        if (Array.isArray(data.templates)) {
          for (var ti = 0; ti < data.templates.length; ti++) {
            var tpl = data.templates[ti];
            if (!tpl || typeof tpl.name !== 'string') { skippedT++; continue; }
            window.__ca.storage.createTemplate(tpl.name, tpl.text || '', tpl.tags, tpl.description || '');
            importedT++;
          }
        }

        if (Array.isArray(data.bundles)) {
          for (var bi = 0; bi < data.bundles.length; bi++) {
            var bun = data.bundles[bi];
            if (!bun || typeof bun.name !== 'string') { skippedB++; continue; }
            var remappedIds = [];
            if (Array.isArray(bun.anchorIds)) {
              for (var ai = 0; ai < bun.anchorIds.length; ai++) {
                var mapped = idMap[bun.anchorIds[ai]];
                if (mapped) remappedIds.push(mapped);
              }
            }
            var newB = window.__ca.storage.createBundle(bun.name, remappedIds, bun.keyword || '');
            if (bun.description) window.__ca.storage.updateBundle(newB.id, { description: bun.description });
            importedB++;
          }
        }

        var importedC = 0;
        var skippedC = 0;

        if (Array.isArray(data.constraints)) {
          for (var ci = 0; ci < data.constraints.length; ci++) {
            var con = data.constraints[ci];
            if (!con || typeof con.name !== 'string' || typeof con.text !== 'string') { skippedC++; continue; }
            var newC = window.__ca.storage.createConstraint(con.name, con.text, con.priority || 'low');
            if (newC) {
              importedC++;
              if (typeof con.active === 'boolean') window.__ca.storage.updateConstraint(newC.id, { active: con.active });
            } else {
              skippedC++;
            }
          }
        }

        if (data.heatmap && typeof data.heatmap === 'object' && !Array.isArray(data.heatmap) && Object.keys(data.heatmap).length > 0) {
          window.__ca.storage.setUsageHeatmap(data.heatmap);
        }

        window.__ca.events.emit('anchors:changed');
        if (importedC > 0) window.__ca.events.emit('constraints:changed');
        var summary = importedA + ' anchors, ' + importedT + ' templates, ' + importedB + ' bundles, ' + importedC + ' constraints';
        if (duplicateA > 0) summary += ' (' + duplicateA + ' dup skipped)';
        if (skippedA > 0) summary += ' (' + skippedA + ' invalid anchors skipped)';
        if (skippedT > 0) summary += ' (' + skippedT + ' invalid templates skipped)';
        if (skippedB > 0) summary += ' (' + skippedB + ' invalid bundles skipped)';
        if (skippedC > 0) summary += ' (' + skippedC + ' invalid constraints skipped)';
        if (data.heatmap && Object.keys(data.heatmap).length > 0) summary += ' + heatmap';
        window.__ca.content.showToast(summary, importedA + importedT + importedB + importedC > 0 ? 'success' : 'warning');
        console.log('[CA] Import: anchors=' + importedA + '(dup=' + duplicateA + ',skipped=' + skippedA + '), templates=' + importedT + '(skipped=' + skippedT + '), bundles=' + importedB + '(skipped=' + skippedB + '), constraints=' + importedC + '(skipped=' + skippedC + ')' + (data.heatmap && Object.keys(data.heatmap).length > 0 ? ', heatmap' : ''));
      } catch (err) {
        console.error('[CA] Import error:', err);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function importTemplates(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data && data.metadata) data = data.items || [];
        if (!Array.isArray(data)) {
          window.__ca.content.showToast('Invalid format: expected array of templates', 'error');
          return;
        }

        var imported = 0;
        var skipped = 0;
        for (var i = 0; i < data.length; i++) {
          var tpl = data[i];
          if (!tpl || typeof tpl.name !== 'string') { skipped++; continue; }
          window.__ca.storage.createTemplate(tpl.name, tpl.text || '', tpl.tags, tpl.description || '');
          imported++;
        }

        window.__ca.events.emit('anchors:changed');
        window.__ca.content.showToast('Imported ' + imported + ' templates' + (skipped > 0 ? ' (' + skipped + ' skipped)' : ''), imported > 0 ? 'success' : 'warning');
        console.log('[CA] Import templates: ' + imported + ' imported, ' + skipped + ' skipped');
      } catch (err) {
        console.error('[CA] Import templates error:', err);
        window.__ca.content.showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function importBundles(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data && data.metadata) data = data.items || [];
        if (!Array.isArray(data)) {
          window.__ca.content.showToast('Invalid format: expected array of bundles', 'error');
          return;
        }

        var imported = 0;
        var skipped = 0;

        for (var i = 0; i < data.length; i++) {
          var entry = data[i];
          if (!entry || !entry.bundle || typeof entry.bundle.name !== 'string') { skipped++; continue; }

          var bun = entry.bundle;
          var memberAnchors = Array.isArray(entry.anchors) ? entry.anchors : [];
          var idMap = {};

          for (var ai = 0; ai < memberAnchors.length; ai++) {
            var anchor = memberAnchors[ai];
            if (!anchor || typeof anchor.text !== 'string') continue;
            var newA = window.__ca.storage.createAnchor(anchor.text, anchor.sourceUrl, anchor.turnsTotal, anchor.global, {
              messageId: anchor.messageId || null,
              blockIndex: anchor.blockIndex != null ? anchor.blockIndex : null,
              msgIndex: anchor.msgIndex != null ? anchor.msgIndex : null,
              blockTextHash: anchor.blockTextHash || null,
              textOffset: anchor.textOffset != null ? anchor.textOffset : null
            });
            idMap[anchor.id] = newA.id;
          }

          var remappedIds = [];
          if (Array.isArray(bun.anchorIds)) {
            for (var bi = 0; bi < bun.anchorIds.length; bi++) {
              var mapped = idMap[bun.anchorIds[bi]] || bun.anchorIds[bi];
              remappedIds.push(mapped);
            }
          }

          var newB = window.__ca.storage.createBundle(bun.name, remappedIds, bun.keyword || '');
          if (bun.description) window.__ca.storage.updateBundle(newB.id, { description: bun.description });
          imported++;
        }

        window.__ca.events.emit('anchors:changed');
        window.__ca.content.showToast('Imported ' + imported + ' bundles' + (skipped > 0 ? ' (' + skipped + ' skipped)' : ''), imported > 0 ? 'success' : 'warning');
        console.log('[CA] Import bundles: ' + imported + ' imported, ' + skipped + ' skipped');
      } catch (err) {
        console.error('[CA] Import bundles error:', err);
        window.__ca.content.showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function importConstraints(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data && data.metadata) data = data.items || [];
        if (!Array.isArray(data)) {
          window.__ca.content.showToast('Invalid format: expected array of constraints', 'error');
          return;
        }

        var imported = 0;
        var skipped = 0;

        for (var i = 0; i < data.length; i++) {
          var con = data[i];
          if (!con || typeof con.name !== 'string' || typeof con.text !== 'string') { skipped++; continue; }
          var newC = window.__ca.storage.createConstraint(con.name, con.text, con.priority || 'low');
          if (newC) {
            imported++;
            if (typeof con.active === 'boolean') window.__ca.storage.updateConstraint(newC.id, { active: con.active });
          } else {
            skipped++;
          }
        }

        window.__ca.events.emit('constraints:changed');
        window.__ca.content.showToast('Imported ' + imported + ' constraints' + (skipped > 0 ? ' (' + skipped + ' skipped)' : ''), imported > 0 ? 'success' : 'warning');
        console.log('[CA] Import constraints: ' + imported + ' imported, ' + skipped + ' skipped');
      } catch (err) {
        console.error('[CA] Import constraints error:', err);
        window.__ca.content.showToast('Import failed: invalid JSON', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function exportAnchors() {
    var anchors = window.__ca.storage.getAll();
    downloadJSON(anchors, 'contextual-anchors-' + Date.now() + '.json');
  }

  function importAnchors(fileInput) {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) {
          console.error('[CA] Import: invalid format, expected array');
          return;
        }

        var imported = 0;
        var skipped = 0;
        for (var i = 0; i < data.length; i++) {
          if (window.__ca.panelMath.validateAnchorSchema(data[i])) {
            var existing = window.__ca.storage.getAll().filter(function(a) { return a.id === data[i].id; });
            if (existing.length === 0) {
              window.__ca.storage.createAnchor(data[i].text, data[i].sourceUrl, data[i].turnsTotal, data[i].global, {
                messageId: data[i].messageId || null,
                blockIndex: data[i].blockIndex != null ? data[i].blockIndex : null,
                msgIndex: data[i].msgIndex != null ? data[i].msgIndex : null,
                blockTextHash: data[i].blockTextHash || null,
                textOffset: data[i].textOffset != null ? data[i].textOffset : null
              });
              imported++;
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        }

        window.__ca.events.emit('anchors:changed');
        console.log('[CA] Import: ' + imported + ' imported, ' + skipped + ' skipped');
      } catch (err) {
        console.error('[CA] Import: parse error', err);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function openHelpGuide() {
    window.open('https://felixfab.github.io/dl-user-guide/', '_blank');
  }

  window.__ca = window.__ca || {};
  window.__ca.panel = {
    init: init,
    renderPanel: renderPanel,
    updateAnchorList: updateAnchorList,
    updateBadge: updateBadge,
    updatePanelStatusBar: updatePanelStatusBar,
    renderTurnPopup: renderTurnPopup,
    removeTurnPopup: removeTurnPopup,
    renderEditorOverlay: renderEditorOverlay,
    renderConfirmDialog: renderConfirmDialog,
    updateBulkBar: updateBulkBar,
    updateCurrentList: updateCurrentList,
    openHelpGuide: openHelpGuide,
    switchTab: switchTab,
    toggleBulk: toggleBulk,
    renderBehaviorEditor: renderBehaviorEditor
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
