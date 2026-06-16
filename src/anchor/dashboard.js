(function() {
  'use strict';

  var overlayEscapeHandler = null;

  function init() {
    if (!window.__ca || !window.__ca.events) {
      setTimeout(init, 100);
      return;
    }
    window.__ca.events.on('analytics:updated', function() {
      if (!window.__ca.shared) return;
      var overlay = window.__ca.shared.$id('ca-dashboard-overlay');
      if (overlay) refreshDashboard();
    });
  }

  /* ── Toggle open/close ── */
  function toggle() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(function() { toggle(); }, 200);
      return;
    }
    var overlay = window.__ca.shared.$id('ca-dashboard-overlay');
    if (overlay) {
      close();
    } else {
      render();
    }
    if (window.__ca && window.__ca.state && window.__ca.state.dashboard) {
      window.__ca.state.dashboard.isOpen = !overlay;
    }
  }

  /* ── Close and cleanup ── */
  function close() {
    var overlay = window.__ca.shared.$id('ca-dashboard-overlay');
    if (overlay) overlay.remove();
    if (overlayEscapeHandler) {
      document.removeEventListener('keydown', overlayEscapeHandler);
      overlayEscapeHandler = null;
    }
    if (window.__ca && window.__ca.state && window.__ca.state.dashboard) {
      window.__ca.state.dashboard.isOpen = false;
    }
  }

  /* ── Refresh existing overlay with updated data ── */
  function refreshDashboard() {
    var overlay = window.__ca.shared.$id('ca-dashboard-overlay');
    if (!overlay) return;
    var body = overlay.querySelector('.ca-dashboard-body');
    if (!body) return;
    var model = computeModel();
    renderBody(body, model);
  }

  /* ── Compute full view model from state ── */
  function computeModel() {
    var a = window.__ca.state.analytics;
    var activeAnchors = window.__ca.storage.getActive();
    var ttlValues = [];
    var anchorTtls = [];

    for (var i = 0; i < activeAnchors.length; i++) {
      var anchor = activeAnchors[i];
      var ttl = window.__ca.dashboardMath.calculateTTL(anchor);
      var keyword = anchor.text ? anchor.text.split(' ').slice(0, 4).join(' ') : '(unnamed)';
      ttlValues.push({ ttl: ttl });
      anchorTtls.push({
        id: anchor.id,
        keyword: keyword,
        ttl: ttl,
        turnsRemaining: anchor.turnsRemaining,
        originalTurns: anchor.originalTurns || anchor.turnsTotal
      });
    }

    var health = window.__ca.dashboardMath.computeAnchorHealth(ttlValues);
    var stats = window.__ca.dashboardMath.computeSessionStats(a.turns);

    var healthStatus = 'healthy';
    if (health < 30) healthStatus = 'danger';
    else if (health < 60) healthStatus = 'warning';

    return {
      prompts: a.prompts || 0,
      turns: (a.turns && a.turns.length) || 0,
      health: health,
      healthStatus: healthStatus,
      anchorTtls: anchorTtls,
      ledger: a.turns || [],
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      uniqueTopics: countUniqueTopics(a.turns)
    };
  }

  function countUniqueTopics(turns) {
    if (!turns || !turns.length) return 0;
    var seen = {};
    var count = 0;
    for (var i = 0; i < turns.length; i++) {
      if (!turns[i].activeAnchors) continue;
      for (var j = 0; j < turns[i].activeAnchors.length; j++) {
        var kw = turns[i].activeAnchors[j];
        if (!seen[kw]) {
          seen[kw] = true;
          count++;
        }
      }
    }
    return count;
  }

  /* ── Render the full dashboard overlay (centered modal) ── */
  function render() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(render, 200);
      return;
    }

    var $create = window.__ca.shared.$create;

    var overlay = $create('div', { id: 'ca-dashboard-overlay', className: 'ca-dashboard-overlay' });
    var panel = $create('div', { className: 'ca-dashboard-panel' });

    /* Topbar */
    var model = computeModel();
    var topbar = $create('div', { className: 'ca-dashboard-topbar' });
    var left = $create('div', { className: 'ca-dashboard-topbar-left' });
    left.appendChild($create('span', { className: 'ca-dashboard-topbar-title', textContent: 'Session Memory' }));

    var status = $create('span', { className: 'ca-dashboard-topbar-status' });
    var dot = $create('span', { className: 'ca-dashboard-pulse-dot' + (model.anchorTtls.length === 0 ? ' inactive' : ' ' + model.healthStatus) });
    status.appendChild(dot);
    var statusLabel = model.anchorTtls.length === 0 ? 'No Anchors' :
                      model.healthStatus === 'danger' ? 'At Risk' :
                      model.healthStatus === 'warning' ? 'Degraded' : 'Active';
    status.appendChild(document.createTextNode(' ' + statusLabel));
    left.appendChild(status);

    topbar.appendChild(left);

    var closeBtn = $create('button', { className: 'ca-dashboard-close-btn', 'data-action': 'close-dashboard', 'aria-label': 'Close dashboard' });
    closeBtn.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'path', attrs: { d: 'M18 6L6 18M6 6l12 12' } }]));
    topbar.appendChild(closeBtn);
    panel.appendChild(topbar);

    /* Body */
    var body = $create('div', { className: 'ca-dashboard-body' });
    renderBody(body, model);
    panel.appendChild(body);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);

    if (window.__ca && window.__ca.state && window.__ca.state.dashboard) {
      window.__ca.state.dashboard.isOpen = true;
    }

    /* Events */
    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (target) {
        var action = target.getAttribute('data-action');
        if (action === 'close-dashboard') {
          close();
          return;
        } else if (action === 'reinject-anchor') {
          handleReinject(target.getAttribute('data-anchor-id'));
          return;
        }
      }
      var panel = e.target.closest('.ca-dashboard-panel');
      if (!panel) {
        close();
      }
    });

    overlayEscapeHandler = function(e) {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', overlayEscapeHandler);
  }

  /* ── Render body content (KPI grid + table + inspection) ── */
  function renderBody(body, model) {
    while (body.firstChild) body.removeChild(body.firstChild);

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    /* KPI grid */
    body.appendChild(_buildKpiGrid($create, model));

    /* Anchor stream table */
    body.appendChild(_buildAnchorTable($create, esc, model));

    /* Inspection section */
    body.appendChild(_buildInspectSection($create, esc, model));
  }

  /* ── Build KPI grid (4 cards) ── */
  function _buildKpiGrid($create, model) {
    var grid = $create('div', { className: 'ca-dashboard-kpi-grid' });

    var kpis = [
      { label: 'Active Turns', value: String(model.turns), hint: 'Session total' },
      { label: 'Anchor Health', value: String(model.health) + '%', hint: model.health > 60 ? 'Memory capacity strong' : 'Consider refreshing anchors' },
      { label: 'Input Tokens', value: formatNum(model.inputTokens), hint: 'Cumulative input' },
      { label: 'Output Tokens', value: formatNum(model.outputTokens), hint: 'Cumulative output' }
    ];

    for (var i = 0; i < kpis.length; i++) {
      var kpi = $create('div', { className: 'ca-dashboard-kpi' });
      kpi.appendChild($create('div', { className: 'ca-dashboard-kpi-label', textContent: kpis[i].label }));
      kpi.appendChild($create('div', { className: 'ca-dashboard-kpi-val', textContent: kpis[i].value }));
      kpi.appendChild($create('div', { className: 'ca-dashboard-kpi-hint', textContent: kpis[i].hint }));
      grid.appendChild(kpi);
    }

    return grid;
  }

  /* ── Build anchor stream table ── */
  function _buildAnchorTable($create, esc, model) {
    var panel = $create('div', { className: 'ca-dashboard-panel-card' });

    var head = $create('div', { className: 'ca-dashboard-panel-head' });
    head.appendChild($create('h2', { className: 'ca-dashboard-panel-title', textContent: 'Pinned Topics' }));

    var chip = $create('span', { className: 'ca-dashboard-chip', textContent: String(model.anchorTtls.length) + ' active' });
    head.appendChild(chip);
    panel.appendChild(head);

    if (model.anchorTtls.length === 0) {
      panel.appendChild($create('div', { className: 'ca-dashboard-empty-state', textContent: 'No active anchors. Create one with Alt+A.' }));
      return panel;
    }

    var wrap = $create('div', { className: 'ca-dashboard-table-wrap' });
    var table = $create('table', { className: 'ca-dashboard-table' });

    var thead = $create('thead');
    var hrow = $create('tr');
    var headers = ['Anchor ID', 'Keyword', 'Turns', 'TTL', 'Status', ''];
    for (var h = 0; h < headers.length; h++) {
      var th = $create('th', { textContent: headers[h] });
      hrow.appendChild(th);
    }
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = $create('tbody');
    for (var i = 0; i < model.anchorTtls.length; i++) {
      tbody.appendChild(_buildTableRow($create, esc, model.anchorTtls[i]));
    }
    table.appendChild(tbody);

    wrap.appendChild(table);
    panel.appendChild(wrap);
    return panel;
  }

  /* ── Build a single table row from an anchor TTL entry ── */
  function _buildTableRow($create, esc, entry) {
    var row = $create('tr');

    /* Anchor ID */
    var idCell = $create('td', { className: 'ca-dashboard-table-id', textContent: _shortenId(entry.id) });
    row.appendChild(idCell);

    /* Keyword */
    var kwCell = $create('td', { className: 'ca-dashboard-table-keyword', textContent: esc(entry.keyword) });
    row.appendChild(kwCell);

    /* Turns */
    var turnsText = String(entry.turnsRemaining) + '/' + String(entry.originalTurns);
    var turnsCell = $create('td', { className: 'ca-dashboard-table-turns', textContent: turnsText });
    row.appendChild(turnsCell);

    /* TTL */
    var ttlText = String(entry.ttl) + '%';
    var ttlCell = $create('td', { className: 'ca-dashboard-table-ttl', textContent: ttlText });
    row.appendChild(ttlCell);

    /* Status */
    var sClass = _statusClass(entry.ttl);
    var sLabel = _statusLabel(entry.ttl);
    var statusCell = $create('td', { className: 'ca-dashboard-status-' + sClass });
    var statusWrap = $create('span', { className: 'ca-dashboard-status-cell' });
    statusWrap.appendChild($create('span', { className: 'ca-dashboard-status-dot' }));
    statusWrap.appendChild($create('span', { className: 'ca-dashboard-status-label', textContent: sLabel }));
    statusCell.appendChild(statusWrap);
    row.appendChild(statusCell);

    /* Refresh */
    var refreshCell = $create('td', { style: { textAlign: 'right', padding: '8px 16px' } });
    var refreshBtn = $create('button', { className: 'ca-dashboard-refresh-btn', 'data-action': 'reinject-anchor', 'data-anchor-id': entry.id, 'aria-label': 'Refresh anchor turns' });
    refreshBtn.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'path', attrs: { d: 'M1 4v6h6M23 20v-6h-6' } }, { tag: 'path', attrs: { d: 'M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15' } }]));
    refreshCell.appendChild(refreshBtn);
    row.appendChild(refreshCell);

    return row;
  }

  /* ── Build inspection section (last input + last output) ── */
  function _buildInspectSection($create, esc, model) {
    var inspect = $create('div', { className: 'ca-dashboard-inspect' });

    var leftCol = $create('div', { className: 'ca-dashboard-inspect-col' });
    leftCol.appendChild($create('h3', { className: 'ca-dashboard-inspect-title', textContent: 'Last Input' }));

    var rightCol = $create('div', { className: 'ca-dashboard-inspect-col' });
    rightCol.appendChild($create('h3', { className: 'ca-dashboard-inspect-title', textContent: 'AI Response Output' }));

    var lastTurn = model.ledger.length > 0 ? model.ledger[model.ledger.length - 1] : null;

    if (lastTurn) {
      /* Left: last input */
      var leftCard = $create('div', { className: 'ca-dashboard-code-card' });
      if (lastTurn.promptText) {
        var tok1 = $create('span', { className: 'ca-dashboard-tok' });
        tok1.textContent = 'user:';
        leftCard.appendChild(tok1);
        leftCard.appendChild($create('br'));
        leftCard.appendChild(document.createTextNode(esc(lastTurn.promptText)));
        leftCard.appendChild($create('br'));
        leftCard.appendChild($create('br'));
        var info1 = $create('span', { className: 'ca-dashboard-comment' });
        info1.textContent = '// Turn ' + lastTurn.turn + ' — ' + formatNum(lastTurn.inputTokens) + ' input tokens';
        leftCard.appendChild(info1);
      } else {
        var tok1b = $create('span', { className: 'ca-dashboard-tok' });
        tok1b.textContent = 'Turn ' + lastTurn.turn + ':';
        leftCard.appendChild(tok1b);
        leftCard.appendChild(document.createTextNode(' ' + formatNum(lastTurn.inputTokens) + ' tokens'));
      }
      if (lastTurn.activeAnchors && lastTurn.activeAnchors.length > 0) {
        leftCard.appendChild($create('br'));
        var comment1 = $create('span', { className: 'ca-dashboard-comment' });
        var tags = lastTurn.activeAnchors.slice(0, 5).map(function(kw) {
          return kw.replace(/[.,;:]+$/, '');
        });
        if (lastTurn.activeAnchors.length > 5) {
          tags.push('+' + (lastTurn.activeAnchors.length - 5) + ' more');
        }
        comment1.textContent = '// Anchors: ' + tags.join(', ');
        leftCard.appendChild(comment1);
      }
      leftCol.appendChild(leftCard);

      /* Right: last output */
      var rightCard = $create('div', { className: 'ca-dashboard-code-card' });
      if (lastTurn.responseText) {
        var tok2 = $create('span', { className: 'ca-dashboard-tok' });
        tok2.textContent = 'assistant:';
        rightCard.appendChild(tok2);
        rightCard.appendChild($create('br'));
        rightCard.appendChild(document.createTextNode(esc(lastTurn.responseText)));
        rightCard.appendChild($create('br'));
        rightCard.appendChild($create('br'));
        var info2 = $create('span', { className: 'ca-dashboard-comment' });
        info2.textContent = '// Tokens: ' + formatNum(lastTurn.inputTokens) + ' in / ' + formatNum(lastTurn.outputTokens) + ' out';
        rightCard.appendChild(info2);
      } else {
        var tok2b = $create('span', { className: 'ca-dashboard-tok' });
        tok2b.textContent = 'assistant:';
        rightCard.appendChild(tok2b);
        rightCard.appendChild(document.createTextNode(' ' + formatNum(lastTurn.outputTokens) + ' tokens'));
        rightCard.appendChild($create('br'));
        rightCard.appendChild($create('br'));
        var comment2 = $create('span', { className: 'ca-dashboard-comment' });
        comment2.textContent = '// Tokens: ' + formatNum(lastTurn.inputTokens) + ' in / ' + formatNum(lastTurn.outputTokens) + ' out';
        rightCard.appendChild(comment2);
      }
      rightCol.appendChild(rightCard);
    } else {
      leftCol.appendChild($create('div', { className: 'ca-dashboard-code-card', textContent: 'No turn data yet' }));
      rightCol.appendChild($create('div', { className: 'ca-dashboard-code-card', textContent: 'Waiting for first response' }));
    }

    inspect.appendChild(leftCol);
    inspect.appendChild(rightCol);
    return inspect;
  }

  /* ── Helpers ── */
  function _shortenId(id) {
    if (!id) return '';
    return 'TX-' + id.replace('anchor_', '').slice(-8);
  }

  function _statusLabel(ttl) {
    if (ttl >= 60) return 'Active';
    if (ttl >= 30) return 'Idle';
    return 'Expired';
  }

  function _statusClass(ttl) {
    if (ttl >= 60) return 'active';
    if (ttl >= 30) return 'idle';
    return 'expired';
  }

  /* ── Re-inject anchor (reset turns to originalTurns) ── */
  function handleReinject(anchorId) {
    if (!anchorId || !window.__ca.storage) return;
    window.__ca.storage.resetTurns(anchorId);
    window.__ca.events.emit('anchors:changed');
    refreshDashboard();
  }

  function formatNum(n) {
    if (typeof n !== 'number') return '0';
    return n.toLocaleString();
  }

  window.__ca = window.__ca || {};
  window.__ca.dashboard = {
    toggle: toggle,
    close: close,
    computeModel: computeModel
  };

  init();
})();
