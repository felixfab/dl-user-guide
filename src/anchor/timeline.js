(function() {
  'use strict';

  var currentSort = 'recently-used';
  var currentGroup = 'day';
  var currentFilter = 'all';
  var currentScope = 'this-page';
  var collapsedGroups = {};
  var overlayEscapeHandler = null;
  var heatmapExpanded = false;
  var heatmapMode = 'activity';
  var heatmapDate = null;
  var heatmapRange = '6months';
  var heatmapColor = 'blue';
  var heatmapScrollPos = 0;
  var heatmapColsVisible = 27;
  var heatmapScrollStep = 4;
  // Aliased to unified bulk state in window.__ca.state.bulk
  // (panel.js and timeline.js share the same state)
  function bulkState() { return window.__ca.state && window.__ca.state.bulk ? window.__ca.state.bulk : { enabled: false, selectedIds: [], entityType: 'anchor' }; }

  var ttlIconSvg = null;

  function init() {
    if (!window.__ca || !window.__ca.events) {
      setTimeout(init, 100);
      return;
    }
    window.__ca.events.on('anchors:changed', function() {
      if (!window.__ca.shared) return;
      var overlay = window.__ca.shared.$id('ca-timeline-overlay');
      if (overlay) updateTimeline();
    });
  }

  function renderTimelineOverlay() {
    if (!window.__ca || !window.__ca.shared) {
      console.warn('[CA] Timeline: dependencies not ready yet, retrying...');
      setTimeout(renderTimelineOverlay, 200);
      return;
    }

    removeTimelineOverlay();

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var overlay = $create('div', { id: 'ca-timeline-overlay', className: 'ca-timeline-overlay' });
    var panel = $create('div', { className: 'ca-timeline-panel' });

    var header = $create('div', { className: 'ca-timeline-header' });
    var title = $create('h2', { className: 'ca-editor-title', textContent: 'Anchor Timeline' });
    header.appendChild(title);

    var headerActions = $create('div', { className: 'ca-header-actions' });

    var bulkBtn = $create('button', { className: 'ca-btn-icon ca-btn-bulk' + (bulkState().enabled ? ' active' : ''), 'data-action': 'toggle-timeline-bulk', 'aria-label': 'Bulk select' });
    var bulkBtnSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bulkBtnSvg.setAttribute('viewBox', '0 0 24 24');
    bulkBtnSvg.setAttribute('fill', 'none');
    bulkBtnSvg.setAttribute('stroke', 'currentColor');
    bulkBtnSvg.setAttribute('stroke-width', '2');
    var bulkBtnRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bulkBtnRect.setAttribute('x', '3');
    bulkBtnRect.setAttribute('y', '3');
    bulkBtnRect.setAttribute('width', '18');
    bulkBtnRect.setAttribute('height', '18');
    bulkBtnRect.setAttribute('rx', '2');
    var bulkBtnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bulkBtnPath.setAttribute('d', 'M9 12l2 2 4-4');
    bulkBtnSvg.appendChild(bulkBtnRect);
    bulkBtnSvg.appendChild(bulkBtnPath);
    bulkBtn.appendChild(bulkBtnSvg);
    headerActions.appendChild(bulkBtn);

    var closeBtn = $create('button', { className: 'ca-panel-close', 'data-action': 'close-timeline', 'aria-label': 'Close timeline' });
    closeBtn.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'path', attrs: { d: 'M18 6L6 18M6 6l12 12' } }]));
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);
    panel.appendChild(header);

    var toolbar = $create('div', { className: 'ca-timeline-toolbar' });

    var sortSelect = buildSelect('timeline-sort', [
      { v: 'recently-used', t: 'Recently Used' },
      { v: 'newest', t: 'Newest' },
      { v: 'most-used', t: 'Most Used' },
      { v: 'least-remaining', t: 'Least Remaining' }
    ], currentSort);
    toolbar.appendChild(sortSelect);

    var groupSelect = buildSelect('timeline-group', [
      { v: 'day', t: 'By Day' },
      { v: 'week', t: 'By Week' },
      { v: 'none', t: 'No Grouping' }
    ], currentGroup);
    toolbar.appendChild(groupSelect);

    var filterSelect = buildSelect('timeline-filter', [
      { v: 'all', t: 'All' },
      { v: 'active', t: 'Active' },
      { v: 'expiring', t: 'Expiring' },
      { v: 'inactive', t: 'Inactive' },
      { v: 'expired', t: 'Expired' },
      { v: 'global', t: 'Global' }
    ], currentFilter);
    toolbar.appendChild(filterSelect);

    var scopeSelect = buildSelect('timeline-scope', [
      { v: 'this-page', t: 'This Page' },
      { v: 'all-pages', t: 'All Pages' }
    ], currentScope);
    toolbar.appendChild(scopeSelect);

    panel.appendChild(toolbar);

    buildHeatmapSection(panel);

    var body = $create('div', { className: 'ca-timeline-body', id: 'ca-timeline-body' });
    panel.appendChild(body);

    var stats = $create('div', { className: 'ca-timeline-stats', id: 'ca-timeline-stats' });
    panel.appendChild(stats);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);

    setupTimelineEvents(overlay);

    overlayEscapeHandler = function(e) {
      if (e.key === 'Escape') removeTimelineOverlay();
    };
    document.addEventListener('keydown', overlayEscapeHandler);

    updateTimeline();
  }

  function buildSelect(actions, opts, selectedValue) {
    var sel = window.__ca.shared.$create('select', { className: 'ca-sort-select', 'data-action': actions, 'aria-label': 'Select option' });
    for (var i = 0; i < opts.length; i++) {
      var opt = document.createElement('option');
      opt.value = opts[i].v;
      opt.textContent = opts[i].t;
      if (opts[i].v === selectedValue) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function buildHeatmapSection(panel) {
    var $create = window.__ca.shared.$create;

    var section = $create('div', { id: 'ca-timeline-heatmap', className: 'ca-timeline-heatmap' });

    var toggle = $create('div', { className: 'ca-timeline-heatmap-toggle', 'data-action': 'toggle-heatmap' });
    toggle.textContent = (heatmapExpanded ? '▾' : '▸') + ' Activity Heatmap';
    section.appendChild(toggle);

    var gridContainer = $create('div', { id: 'ca-timeline-heatmap-grid-container', className: 'ca-timeline-heatmap-grid-container' + (heatmapExpanded ? '' : ' collapsed') });
    section.appendChild(gridContainer);

    if (heatmapExpanded) {
      renderHeatmapGrid(gridContainer);
    }

    panel.appendChild(section);
  }

  function renderHeatmapGrid(container) {
    var $create = window.__ca.shared.$create;
    var heatmap = {};
    var allAnchors = window.__ca.storage && window.__ca.storage.getAll ? window.__ca.storage.getAll() : [];
    if (currentScope === 'this-page' && window.__ca.content && window.__ca.content.filterByScope) {
      allAnchors = window.__ca.content.filterByScope(allAnchors);
    }
    if (heatmapMode === 'created') {
      for (var ai = 0; ai < allAnchors.length; ai++) {
        var ck = window.__ca.shared.dateKeyFor(allAnchors[ai].createdAt);
        heatmap[ck] = (heatmap[ck] || 0) + 1;
      }
    } else {
      var usageFound = 0;
      for (var ai = 0; ai < allAnchors.length; ai++) {
        var history = allAnchors[ai].usageHistory;
        if (history && history.length) {
          for (var hi = 0; hi < history.length; hi++) {
            var hk = window.__ca.shared.dateKeyFor(history[hi]);
            heatmap[hk] = (heatmap[hk] || 0) + 1;
            usageFound++;
          }
        }
      }
      if (typeof console !== 'undefined') {
        var logNow = new Date();
        var logToday = new Date(logNow.getFullYear(), logNow.getMonth(), logNow.getDate()).getTime();
        var logKeys = Object.keys(heatmap);
        var logSample = logKeys.slice(0, 3).map(function(k) { return { key: k, iso: new Date(parseInt(k, 10)).toISOString() }; });
        console.log('[CA] Usage heatmap: anchors=' + allAnchors.length + ' usageEntries=' + usageFound + ' todayVal=' + (heatmap[logToday] || 0) + ' todayKey=' + logToday + ' todayISO=' + new Date(logToday).toISOString() + ' keys=' + logKeys.length + ' sampleKeys=' + JSON.stringify(logSample));
      }
    }

    while (container.firstChild) container.removeChild(container.firstChild);

    var now = new Date();
    var todayLocal = window.__ca.shared.dateKeyFor(now);

    var rangeDays;
    if (heatmapRange === '3months') {
      rangeDays = 90;
    } else if (heatmapRange === 'all') {
      var earliestDay = todayLocal;
      var hkeys = Object.keys(heatmap);
      for (var hk = 0; hk < hkeys.length; hk++) {
        var hd = parseInt(hkeys[hk], 10);
        if (!isNaN(hd) && hd < earliestDay) earliestDay = hd;
      }
      var actualDays = Math.ceil((todayLocal - earliestDay) / 86400000) + 1;
      rangeDays = Math.max(actualDays, 90);
    } else {
      rangeDays = 180;
    }
    var rawStartLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() - rangeDays + 1).getTime();
    var startDow = new Date(rawStartLocal).getDay() || 7;
    var startDateLocal = rawStartLocal - (startDow - 1) * 86400000;

    var maxVal = 0;
    var dates = Object.keys(heatmap);
    for (var i = 0; i < dates.length; i++) {
      var ts = parseInt(dates[i], 10);
      if (ts >= startDateLocal) {
        maxVal = Math.max(maxVal, heatmap[dates[i]]);
      }
    }
    if (maxVal === 0) maxVal = 1;

    if (typeof console !== 'undefined') {
      console.log('[CA] Heatmap: range=' + heatmapRange + ' days=' + rangeDays + ' start=' + new Date(rawStartLocal).toISOString() + ' todayVal=' + (heatmap[todayLocal] || 0) + ' entries=' + dates.length + ' maxVal=' + maxVal + ' heatmapKeysSample=' + dates.slice(0, 3).join(','));
    }

    var controls = $create('div', { className: 'ca-timeline-heatmap-controls' });

    var modeToggle = $create('button', {
      className: 'ca-timeline-heatmap-mode-btn',
      'data-action': 'heatmap-mode',
      textContent: heatmapMode === 'activity' ? 'Mode: Usage' : 'Mode: Created'
    });
    controls.appendChild(modeToggle);

    var colorToggle = $create('button', {
      className: 'ca-timeline-heatmap-color-btn',
      'data-action': 'heatmap-color',
      textContent: heatmapColor === 'blue' ? 'Blue' : 'Green'
    });
    controls.appendChild(colorToggle);

    var rangeSelect = buildSelect('heatmap-range', [
      { v: '3months', t: '3 Months' },
      { v: '6months', t: '6 Months' },
      { v: 'all', t: 'All Time' }
    ], heatmapRange);
    rangeSelect.className = 'ca-timeline-heatmap-range';
    controls.appendChild(rangeSelect);

    if (heatmapDate) {
      var clearBtn = $create('button', { className: 'ca-timeline-heatmap-clear', 'data-action': 'clear-heatmap', textContent: 'Clear filter' });
      controls.appendChild(clearBtn);
    }

    container.appendChild(controls);

    var gridFrame = $create('div', { className: 'ca-timeline-heatmap-frame' });
    var grid = $create('div', { className: 'ca-timeline-heatmap-grid' });
    var headerRow = $create('div', { className: 'ca-timeline-heatmap-row' });
    var corner = $create('div', { className: 'ca-timeline-heatmap-label' });
    headerRow.appendChild(corner);

    var weekMs = 7 * 86400000;
    var totalCols = Math.max(1, Math.floor((todayLocal - startDateLocal) / weekMs) + 1);
    var colStartDates = [];
    for (var c = totalCols - 1; c >= 0; c--) {
      var cd = new Date(startDateLocal);
      cd.setDate(cd.getDate() + c * 7);
      var colTs = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate()).getTime();
      colStartDates.push(colTs);
    }

    if (heatmapScrollPos > totalCols - heatmapColsVisible) {
      heatmapScrollPos = Math.max(0, totalCols - heatmapColsVisible);
    }
    var visibleDates = colStartDates.slice(heatmapScrollPos, heatmapScrollPos + heatmapColsVisible);

    var currentMonth = '';
    for (var ci = 0; ci < visibleDates.length; ci++) {
      var colDate = new Date(visibleDates[ci]);
      var monthLabel = colDate.toLocaleDateString('en-US', { month: 'short' });
      var label = monthLabel !== currentMonth ? monthLabel : '';
      currentMonth = monthLabel;
      var colLabel = $create('div', { className: 'ca-timeline-heatmap-label', textContent: label });
      headerRow.appendChild(colLabel);
    }
    grid.appendChild(headerRow);

    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (var r = 0; r < 7; r++) {
      var row = $create('div', { className: 'ca-timeline-heatmap-row' });
      var dayLabel = $create('div', { className: 'ca-timeline-heatmap-label', textContent: days[r] });
      row.appendChild(dayLabel);

      for (var ci = 0; ci < visibleDates.length; ci++) {
        var d = new Date(visibleDates[ci]);
        d.setDate(d.getDate() + r);
        var cellTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        var cellKey = cellTs;
        var val = heatmap[cellKey] || 0;
        var opacity = val > 0 ? Math.max(0.25, Math.min(1, val / maxVal)) : 0;

        var cellClass = 'ca-timeline-heatmap-cell';
        if (val > 0) cellClass += ' populated';
        if (heatmapDate && cellTs === heatmapDate.getTime()) cellClass += ' selected';
        if (cellTs === todayLocal) cellClass += ' today';

        var cell = $create('div', { className: cellClass, 'data-action': 'select-heatmap-day', 'data-date': String(cellTs) });
        var colorVar = heatmapColor === 'blue' ? 'var(--ca-accent)' : 'var(--ca-success)';
        if (val > 0) {
          cell.style.backgroundColor = colorVar;
          cell.style.opacity = String(opacity);
        }
        if (cellTs === todayLocal) {
          var diagOpacity = val > 0 ? Math.max(0.25, Math.min(1, val / maxVal)) : 0;
          console.log('[CA] Today cell diag:', JSON.stringify({
            range: heatmapRange,
            totalCols: totalCols,
            visibleCols: visibleDates.length,
            startDate: new Date(startDateLocal).toISOString(),
            todayLocal: todayLocal,
            cellTs: cellTs,
            cellKey: cellKey,
            val: val,
            maxVal: maxVal,
            opacity: diagOpacity,
            classList: cellClass,
            bgColor: cell.style.backgroundColor,
            cellOpacity: cell.style.opacity,
            parentTag: cell.parentElement ? cell.parentElement.tagName : 'none',
            parentClass: cell.parentElement ? cell.parentElement.className : 'none'
          }));
        }
        cell.title = new Date(cellTs).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' \u00B7 ' + val + ' events';
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }

    gridFrame.appendChild(grid);
    container.appendChild(gridFrame);

    if (totalCols > heatmapColsVisible) {
      var scrollBar = $create('div', { className: 'ca-heatmap-scroll-bar' });

      var atLeft = heatmapScrollPos <= 0;
      var atRight = heatmapScrollPos >= totalCols - heatmapColsVisible;

      var leftBtn = $create('button', { className: 'ca-heatmap-scroll-btn', 'data-action': 'heatmap-scroll-left', 'data-amount': String(-heatmapScrollStep), 'aria-label': 'Scroll left' });
      if (atLeft) leftBtn.setAttribute('disabled', '');
      var leftSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      leftSvg.setAttribute('viewBox', '0 0 24 24');
      leftSvg.setAttribute('fill', 'none');
      leftSvg.setAttribute('stroke', 'currentColor');
      leftSvg.setAttribute('stroke-width', '2');
      leftSvg.setAttribute('width', '16');
      leftSvg.setAttribute('height', '16');
      var leftPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      leftPath.setAttribute('d', 'M15 18l-6-6 6-6');
      leftSvg.appendChild(leftPath);
      leftBtn.appendChild(leftSvg);
      scrollBar.appendChild(leftBtn);

      var rightBtn = $create('button', { className: 'ca-heatmap-scroll-btn', 'data-action': 'heatmap-scroll-right', 'data-amount': String(heatmapScrollStep), 'aria-label': 'Scroll right' });
      if (atRight) rightBtn.setAttribute('disabled', '');
      var rightSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      rightSvg.setAttribute('viewBox', '0 0 24 24');
      rightSvg.setAttribute('fill', 'none');
      rightSvg.setAttribute('stroke', 'currentColor');
      rightSvg.setAttribute('stroke-width', '2');
      rightSvg.setAttribute('width', '16');
      rightSvg.setAttribute('height', '16');
      var rightPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      rightPath.setAttribute('d', 'M9 18l6-6-6-6');
      rightSvg.appendChild(rightPath);
      rightBtn.appendChild(rightSvg);
      scrollBar.appendChild(rightBtn);

      container.appendChild(scrollBar);
    }

    var legend = $create('div', { className: 'ca-timeline-heatmap-legend' });
    legend.appendChild($create('span', { textContent: 'Less' }));
    for (var lv = 0; lv < 4; lv++) {
      var legCell = $create('div', { className: 'ca-timeline-heatmap-cell populated' });
      legCell.style.backgroundColor = colorVar;
      legCell.style.opacity = String((lv + 1) * 0.25);
      legend.appendChild(legCell);
    }
    legend.appendChild($create('span', { textContent: 'More' }));
    container.appendChild(legend);
  }

  function updateHeatmapSection() {
    var container = window.__ca.shared.$id('ca-timeline-heatmap-grid-container');
    if (!container || container.classList.contains('collapsed')) return;
    renderHeatmapGrid(container);
  }

  function removeTimelineOverlay() {
    var overlay = window.__ca.shared.$id('ca-timeline-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (overlayEscapeHandler) {
      document.removeEventListener('keydown', overlayEscapeHandler);
      overlayEscapeHandler = null;
    }
  }

  function updateTimeline() {
    var $create = window.__ca.shared.$create;
    var anchors = window.__ca.storage.getAll();
    var expiringThreshold = (window.__ca.state && window.__ca.state.expiringThreshold) || 3;

    if (heatmapDate) {
      anchors = anchors.filter(function(a) {
        if (heatmapMode === 'created') {
          var cKey = window.__ca.shared.dateKeyFor(a.createdAt);
          return cKey === heatmapDate.getTime();
        }
        var history = a.usageHistory;
        if (!history) return false;
        for (var hi = 0; hi < history.length; hi++) {
          var hKey = window.__ca.shared.dateKeyFor(history[hi]);
          if (hKey === heatmapDate.getTime()) return true;
        }
        return false;
      });
    }

    anchors = window.__ca.timelineMath.filterAnchors(anchors, currentFilter, expiringThreshold);

    if (currentScope === 'this-page' && window.__ca.content && window.__ca.content.filterByScope) {
      anchors = window.__ca.content.filterByScope(anchors);
    }

    anchors = window.__ca.timelineMath.sortAnchors(anchors, currentSort);

    var groups = {};
    if (currentGroup === 'none') {
      groups['All'] = anchors;
    } else if (currentGroup === 'day') {
      groupByDay(anchors, groups);
    } else if (currentGroup === 'week') {
      groupByWeek(anchors, groups);
    }

    updateHeatmapSection();

    var body = window.__ca.shared.$id('ca-timeline-body');
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);

    if (bulkState().enabled && bulkState().selectedIds.length > 0) {
      var bulkBar = $create('div', { className: 'ca-timeline-bulk-bar' });
      var bulkCount = $create('span', { className: 'ca-timeline-bulk-count', textContent: bulkState().selectedIds.length + ' selected' });
      bulkBar.appendChild(bulkCount);
      var bulkToggleBtn = $create('button', { className: 'ca-btn-bulk-action', 'data-action': 'bulk-toggle-timeline', textContent: 'Toggle' });
      bulkBar.appendChild(bulkToggleBtn);
      var bulkExtendBtn = $create('button', { className: 'ca-btn-bulk-action', 'data-action': 'bulk-extend-timeline', textContent: '+5' });
      bulkBar.appendChild(bulkExtendBtn);
      var bulkDeleteBtn = $create('button', { className: 'ca-btn-bulk-action ca-btn-danger', 'data-action': 'bulk-delete-timeline', textContent: 'Delete' });
      bulkBar.appendChild(bulkDeleteBtn);
      body.appendChild(bulkBar);
    }

    if (currentGroup === 'day') {
      renderGroup(body, 'Today', groups['Today']);
      renderGroup(body, 'Yesterday', groups['Yesterday']);
      renderGroup(body, 'This Week', groups['This Week']);
      renderGroup(body, 'Last Week', groups['Last Week']);
      renderGroup(body, 'Older', groups['Older']);
    } else if (currentGroup === 'week') {
      var weekKeys = Object.keys(groups).sort().reverse();
      for (var wk = 0; wk < weekKeys.length; wk++) {
        renderGroup(body, weekKeys[wk], groups[weekKeys[wk]]);
      }
    } else {
      renderGroup(body, '', groups['All']);
    }

    updateStatsBar();
  }

  function groupByDay(anchors, groups) {
    window.__ca.timelineMath.groupByDay(anchors, groups, new Date(), window.__ca.shared.dateKeyFor);
  }

  function groupByWeek(anchors, groups) {
    window.__ca.timelineMath.groupByWeek(anchors, groups);
  }

  function addToGroup(groups, key, anchor) {
    window.__ca.timelineMath.addToGroup(groups, key, anchor);
  }

  function renderGroup(body, label, anchors) {
    if (!anchors || anchors.length === 0) return;

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var group = $create('div', { className: 'ca-timeline-group' });

    if (label) {
      var isCollapsed = collapsedGroups[label] === true;
      var isOlder = label === 'Older';
      var collapsedDefault = isOlder;

      if (collapsedGroups[label] === undefined && collapsedDefault) {
        collapsedGroups[label] = true;
        isCollapsed = true;
      }

      var hdr = $create('div', { className: 'ca-timeline-group-hdr', 'data-action': 'toggle-timeline-group', 'data-group': label });
      hdr.textContent = label + ' (' + anchors.length + ')' + (isCollapsed ? ' ▸' : ' ▾');
      group.appendChild(hdr);

      if (isCollapsed) {
        body.appendChild(group);
        return;
      }
    }

    for (var i = 0; i < anchors.length; i++) {
      group.appendChild(buildTimelineCard(anchors[i]));
    }

    body.appendChild(group);
  }

  function buildTimelineCard(a) {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var isExpired = a.turnsRemaining === 0;
    var isInactive = !a.active && !isExpired;
    var isExpiring = !isExpired && !isInactive && a.turnsRemaining <= ((window.__ca.state && window.__ca.state.expiringThreshold) || 3);
    var pct = a.turnsTotal > 0 ? (a.turnsRemaining / a.turnsTotal * 100) : 0;

    var card = $create('div', { className: 'ca-timeline-card' + (isInactive ? ' inactive' : ''), 'data-action': 'open-timeline-anchor', 'data-id': a.id });

    if (bulkState().enabled) {
      var cb = $create('div', {
        className: 'ca-bulk-checkbox' + (bulkState().selectedIds.indexOf(a.id) !== -1 ? ' checked' : ''),
        'data-action': 'bulk-select-timeline',
        'data-id': a.id
      });
      card.appendChild(cb);
    }

    var topRow = $create('div', { className: 'ca-timeline-card-top' });

    var statusClass = 'ca-timeline-card-status' + (isInactive ? ' inactive' : (isExpired ? ' expired' : (isExpiring ? ' expiring' : '')));
    var statusDot = $create('span', { className: statusClass, textContent: isInactive ? '◇' : (isExpired ? '○' : '●') });
    topRow.appendChild(statusDot);

    if (a.global) {
      var globalChip = $create('span', { className: 'ca-timeline-global-chip', textContent: 'Global' });
      topRow.appendChild(globalChip);
    }

    var title = $create('span', { className: 'ca-timeline-card-title', textContent: esc(a.text) });
    topRow.appendChild(title);

    var turnsPill = $create('span', {
      className: 'ca-timeline-turns-pill' + (isInactive ? ' inactive' : (isExpired ? ' expired' : (isExpiring ? ' expiring' : ''))),
      textContent: esc(a.turnsRemaining) + '/' + esc(a.turnsTotal) + (isExpired ? ' EXPIRED' : (isExpiring ? ' EXPIRING' : ''))
    });
    topRow.appendChild(turnsPill);

    if (a.ttlMinutes !== null && a.ttlExpiresAt !== null) {
      var ttlRemain = a.ttlExpiresAt - Date.now();
      if (ttlRemain > 0) {
        if (!ttlIconSvg) {
          ttlIconSvg = window.__ca.shared.$icon('0 0 24 24', [
            { tag: 'path', attrs: { d: 'M6 2h12M6 22h12M6 6l6 6 6-6M6 18l6-6 6 6' } }
          ]);
          ttlIconSvg.setAttribute('class', 'ca-ttl-icon');
        }
        var remainingMins = Math.ceil(ttlRemain / 60000);
        var ttlClass = 'ca-ttl-pill' + (remainingMins < 60 ? ' warning' : '');
        var ttlText = window.__ca.shared.formatTTL(remainingMins);
        var ttlPill = $create('span', { className: ttlClass });
        ttlPill.appendChild(ttlIconSvg.cloneNode(true));
        ttlPill.appendChild(document.createTextNode(' ' + ttlText));
        topRow.appendChild(ttlPill);
      }
    }

    card.appendChild(topRow);

    var bar = $create('div', { className: 'ca-timeline-card-bar' });
    var fill = $create('div', { className: 'ca-timeline-card-fill' + (isExpired ? ' expired' : (isExpiring ? ' expiring' : '')) });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    card.appendChild(bar);

    var metaRow = $create('div', { className: 'ca-timeline-card-meta' });

    if (a.tags && a.tags.length > 0) {
      var maxTags = Math.min(3, a.tags.length);
      for (var t = 0; t < maxTags; t++) {
        var tagSpan = $create('span', { className: 'ca-timeline-tag', textContent: '#' + esc(a.tags[t]) });
        metaRow.appendChild(tagSpan);
      }
      if (a.tags.length > 3) {
        var moreTag = $create('span', { className: 'ca-timeline-tag', textContent: '+' + (a.tags.length - 3) + ' more' });
        metaRow.appendChild(moreTag);
      }
    }

    if (a.sourceUrl) {
      var domain = a.sourceUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      var sourceSpan = $create('span', { textContent: esc(domain) });
      metaRow.appendChild(sourceSpan);
    }

    var usageParts = [];
    if (a.usageCount) usageParts.push(esc(a.usageCount) + ' uses');
    if (a.lastUsed) usageParts.push('last: ' + relativeTime(a.lastUsed));
    else usageParts.push('unused');
    var usageSpan = $create('span', { textContent: usageParts.join(' · ') });
    metaRow.appendChild(usageSpan);

    var copyAction = $create('span', { className: 'ca-timeline-action', 'data-action': 'copy-timeline-anchor', 'data-id': a.id, title: 'Copy', ariaLabel: 'Copy anchor' });
    copyAction.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'rect', attrs: { x: '9', y: '9', width: '13', height: '13', rx: '2' } }, { tag: 'path', attrs: { d: 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1' } }]));
    metaRow.appendChild(copyAction);

    var injectAction = $create('span', { className: 'ca-timeline-action inject', 'data-action': 'inject-timeline-anchor', 'data-id': a.id, title: 'Inject', ariaLabel: 'Inject into prompt' });
    injectAction.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'path', attrs: { d: 'M5 12h13M12 5l7 7-7 7' } }]));
    metaRow.appendChild(injectAction);

    card.appendChild(metaRow);

    return card;
  }

  function relativeTime(timestamp) {
    return window.__ca.timelineMath.relativeTime(timestamp);
  }

  function updateStatsBar() {
    var all = window.__ca.storage.getAll();
    if (currentScope === 'this-page' && window.__ca.content && window.__ca.content.filterByScope) {
      all = window.__ca.content.filterByScope(all);
    }
    var s = window.__ca.timelineMath.computeStats(all);

    var stats = window.__ca.shared.$id('ca-timeline-stats');
    if (!stats) return;
    stats.textContent = s.total + ' total \u00B7 ' + s.active + ' active \u00B7 ' + s.expired + ' expired \u00B7 ' + s.consumed + ' turns consumed';
  }

  function setupTimelineEvents(overlay) {
    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      var action = target.dataset.action;

      if (action === 'close-timeline') {
        removeTimelineOverlay();
      } else if (action === 'open-timeline-anchor') {
        if (bulkState().enabled) return;
        var id = target.closest('[data-id]').dataset.id;
        var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === id; })[0];
        if (anchor) {
          window.__ca.panel.renderEditorOverlay('anchor', anchor);
        }
      } else if (action === 'copy-timeline-anchor') {
        var cid = target.closest('[data-id]').dataset.id;
        var ca = window.__ca.storage.getAll().filter(function(a) { return a.id === cid; })[0];
        if (ca && ca.text) {
          navigator.clipboard.writeText(ca.text).catch(function() {});
        }
      } else if (action === 'inject-timeline-anchor') {
        var iid = target.closest('[data-id]').dataset.id;
        var ia = window.__ca.storage.getAll().filter(function(a) { return a.id === iid; })[0];
        if (ia && ia.text && window.__ca.content) {
          window.__ca.content.injectAnchorToPrompt(ia);
        }
      } else if (action === 'toggle-timeline-bulk') {
        bulkState().enabled = !bulkState().enabled;
        bulkState().selectedIds = [];
        var bBtn = window.__ca.shared.$one('[data-action="toggle-timeline-bulk"]');
        if (bBtn) bBtn.className = 'ca-btn-icon ca-btn-bulk' + (bulkState().enabled ? ' active' : '');
        updateTimeline();
      } else if (action === 'bulk-select-timeline') {
        var bid = target.dataset.id;
        var idx = bulkState().selectedIds.indexOf(bid);
        if (idx === -1) {
          bulkState().selectedIds.push(bid);
        } else {
          bulkState().selectedIds.splice(idx, 1);
        }
        updateTimeline();
      } else if (action === 'bulk-toggle-timeline') {
        if (bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkToggle(bulkState().selectedIds);
          window.__ca.events.emit('anchors:changed');
        }
      } else if (action === 'bulk-extend-timeline') {
        if (bulkState().selectedIds.length > 0) {
          window.__ca.storage.bulkExtend(bulkState().selectedIds, 5);
          window.__ca.events.emit('anchors:changed');
        }
      } else if (action === 'bulk-delete-timeline') {
        var bcount = bulkState().selectedIds.length;
        window.__ca.panel.renderConfirmDialog('Delete ' + bcount + ' selected anchor' + (bcount > 1 ? 's' : '') + '?', function() {
          window.__ca.storage.bulkDelete(bulkState().selectedIds);
          bulkState().selectedIds = [];
          window.__ca.events.emit('anchors:changed');
          updateTimeline();
        });
      } else if (action === 'toggle-timeline-group') {
        var group = target.dataset.group;
        if (group) {
          if (collapsedGroups[group]) {
            delete collapsedGroups[group];
          } else {
            collapsedGroups[group] = true;
          }
          updateTimeline();
        }
      } else if (action === 'toggle-heatmap') {
        heatmapExpanded = !heatmapExpanded;
        heatmapDate = null;
        heatmapScrollPos = 0;
        var toggle = window.__ca.shared.$one('.ca-timeline-heatmap-toggle');
        if (toggle) {
          toggle.textContent = (heatmapExpanded ? '▾' : '▸') + ' Activity Heatmap';
        }
        var gridContainer = window.__ca.shared.$id('ca-timeline-heatmap-grid-container');
        if (gridContainer) {
          gridContainer.className = 'ca-timeline-heatmap-grid-container' + (heatmapExpanded ? '' : ' collapsed');
          updateTimeline();
        }
      } else if (action === 'select-heatmap-day') {
        var date = parseInt(target.dataset.date, 10);
        if (heatmapDate && heatmapDate.getTime() === date) {
          heatmapDate = null;
        } else {
          heatmapDate = new Date(date);
        }
        updateTimeline();
      } else if (action === 'heatmap-mode') {
        heatmapMode = heatmapMode === 'activity' ? 'created' : 'activity';
        updateTimeline();
      } else if (action === 'heatmap-color') {
        heatmapColor = heatmapColor === 'blue' ? 'green' : 'blue';
        updateTimeline();
      } else if (action === 'heatmap-scroll-left' || action === 'heatmap-scroll-right') {
        var amount = parseInt(target.dataset.amount, 10);
        heatmapScrollPos = Math.max(0, heatmapScrollPos + amount);
        updateTimeline();
      } else if (action === 'clear-heatmap') {
        heatmapDate = null;
        updateTimeline();
      }
    });

    overlay.addEventListener('change', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      if (target.dataset.action === 'timeline-sort') {
        currentSort = target.value;
        heatmapScrollPos = 0;
        updateTimeline();
      } else if (target.dataset.action === 'timeline-group') {
        currentGroup = target.value;
        collapsedGroups = {};
        heatmapDate = null;
        heatmapScrollPos = 0;
        updateTimeline();
      } else if (target.dataset.action === 'timeline-filter') {
        currentFilter = target.value;
        heatmapDate = null;
        heatmapScrollPos = 0;
        updateTimeline();
      } else if (target.dataset.action === 'timeline-scope') {
        currentScope = target.value;
        heatmapDate = null;
        heatmapScrollPos = 0;
        updateTimeline();
      } else if (target.dataset.action === 'heatmap-range') {
        heatmapRange = target.value;
        heatmapDate = null;
        heatmapScrollPos = 0;
        updateTimeline();
      }
    });
  }

  window.__ca = window.__ca || {};
  window.__ca.timeline = {
    renderTimelineOverlay: renderTimelineOverlay,
    removeTimelineOverlay: removeTimelineOverlay,
    updateTimeline: updateTimeline
  };

  init();
})();
