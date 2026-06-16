(function() {
  'use strict';

  /* ── Dependencies (cached after init) ── */
  var shared;

  /* ── Demo data: always available so simulator works out of the box ── */
  var DEMO_ANCHORS = [
    {
      id: '_demo_sales',
      text: 'Our Q3 revenue increased 23% year-over-year, driven by enterprise expansion in the APAC region. Key growth areas: cloud services (+41%), professional services (+18%).',
      triggerKeywords: ['sales', 'revenue'],
      tags: ['business'],
      domainFocus: ['Sales Strategy', 'Market Analysis'],
      toneProfile: { tone: 'Professional, data-driven', avoid: 'Speculation, hype' },
      socraticTrigger: 'What data supports that projection?',
      uncertaintyProtocol: 'If market data is older than 30 days, flag as potentially stale.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Bullet points with numbers', clarity: 'Separate fact from interpretation', compliance: 'Include confidence intervals on projections' }
    },
    {
      id: '_demo_python',
      text: 'Use `asyncio.gather()` for concurrent I/O-bound tasks. Example: `results = await asyncio.gather(*[fetch(url) for url in urls])`',
      triggerKeywords: ['python', 'code'],
      tags: ['technical'],
      domainFocus: ['Software Engineering', 'Python'],
      toneProfile: { tone: 'Technical, example-driven, concise', avoid: 'Over-explaining syntax basics' },
      socraticTrigger: 'What happens under the hood with that call?',
      uncertaintyProtocol: 'If async behavior is unclear, trace the event loop before recommending.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Code snippet with explanation', clarity: 'Show input/output examples', compliance: 'Follow PEP 8 style guide' }
    },
    {
      id: '_demo_strategy',
      text: 'Decision framework: (1) Define objective, (2) Gather data, (3) Evaluate options against KPIs, (4) Make recommendation with risk assessment.',
      triggerKeywords: ['strategy', 'meeting'],
      tags: ['business'],
      domainFocus: ['Strategic Planning', 'Decision Making'],
      toneProfile: { tone: 'Structured, analytical, decisive', avoid: 'Analysis paralysis, vague timelines' },
      socraticTrigger: 'What are the risks and how do we mitigate them?',
      uncertaintyProtocol: 'Score each option by confidence level and identify data gaps.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Framework with numbered steps', clarity: 'Options compared against KPIs with trade-offs', compliance: 'Document assumptions and data sources' }
    },
    {
      id: '_demo_dev',
      text: 'Codebase conventions: ES modules over CommonJS, async/await over callbacks, TypeScript strict mode enabled. All public APIs require JSDoc. Max function length: 40 lines. Test coverage minimum: 80%.',
      triggerKeywords: ['code', 'development', 'typescript'],
      tags: ['technical'],
      domainFocus: ['Software Engineering', 'Code Quality', 'Test-Driven Development'],
      toneProfile: { tone: 'Precise, technical, action-oriented', avoid: 'Vague generalizations, hand-wavy estimates' },
      socraticTrigger: 'Do you have a test for that edge case?',
      uncertaintyProtocol: 'If performance impact is unclear, request a benchmark before committing.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Code blocks with language tags', clarity: 'Explain rationale, not just what', compliance: 'Follow team style guide' }
    },
    {
      id: '_demo_finance',
      text: 'Compliance framework: client recommendations must include risk assessment, fee disclosure, and conflict-of-interest statement. SEC Rule 17a-3 recordkeeping applies. Fiduciary duty overrides standard advice.',
      triggerKeywords: ['finance', 'compliance', 'regulatory'],
      tags: ['business', 'compliance'],
      domainFocus: ['Finance', 'Regulatory Compliance', 'Risk Management'],
      toneProfile: { tone: 'Formal, risk-aware, evidence-based', avoid: 'Speculative projections, casual language' },
      socraticTrigger: 'What is the risk-adjusted return for that recommendation?',
      uncertaintyProtocol: 'Flag any uncertainty in valuation models and suggest a second opinion.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Structured report with disclaimers', clarity: 'Plain language for client, precise for regulators', compliance: 'Include all required SEC disclosures' }
    },
    {
      id: '_demo_medical',
      text: 'Clinical documentation: SOAP format required. ICD-10 codes for all conditions. HIPAA compliance mandatory. Allergies and contraindications listed before any treatment recommendation.',
      triggerKeywords: ['medical', 'clinical', 'diagnosis'],
      tags: ['medical'],
      domainFocus: ['Medical Informatics', 'Clinical Documentation', 'Patient Safety'],
      toneProfile: { tone: 'Clinical, objective, thorough', avoid: 'Informal shorthand, incomplete assessments' },
      socraticTrigger: 'Have you ruled out the differential diagnoses?',
      uncertaintyProtocol: 'If diagnosis is uncertain, document differential and recommend further testing.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'SOAP structure (Subjective, Objective, Assessment, Plan)', clarity: 'Use standardized medical terminology', compliance: 'HIPAA privacy rule compliant' }
    },
    {
      id: '_demo_security',
      text: 'Incident response playbook: (1) Isolate affected systems, (2) Preserve forensic evidence, (3) Contain threat, (4) Eradicate root cause, (5) Recover and validate, (6) Post-mortem within 72 hours.',
      triggerKeywords: ['security', 'incident', 'breach'],
      tags: ['technical', 'security'],
      domainFocus: ['Cyber Security', 'Incident Response', 'Forensic Analysis'],
      toneProfile: { tone: 'Urgent, precise, procedure-driven', avoid: 'Panic, blame, vague timelines' },
      socraticTrigger: 'What is the blast radius and have we contained patient zero?',
      uncertaintyProtocol: 'If scope is unclear, assume worst case and escalate to senior analyst.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Timeline with IOCs and MITRE ATT&CK mappings', clarity: 'Executive summary first, technical details second', compliance: 'GDPR breach notification within 72h if applicable' }
    },
    {
      id: '_demo_ecommerce',
      text: 'Cart state persisted server-side with optimistic UI updates. Payment: authorize on submit, capture on fulfillment. Abandoned cart recovery triggered after 2 hours. Inventory reserved for 15 minutes during checkout.',
      triggerKeywords: ['checkout', 'cart', 'payment'],
      tags: ['technical', 'business'],
      domainFocus: ['E-Commerce', 'System Architecture', 'Payment Systems'],
      toneProfile: { tone: 'Systematic, reliability-focused', avoid: 'Over-optimistic failure assumptions' },
      socraticTrigger: 'What happens if the payment gateway times out?',
      uncertaintyProtocol: 'Treat any payment ambiguity as declined — never double-charge without confirmation.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Sequence diagrams for transaction flows', clarity: 'Trace each state transition with error paths', compliance: 'PCI-DSS compliant data handling' }
    },
    {
      id: '_demo_gaming',
      text: 'Player position validated server-side every 5 seconds. Inventory changes logged with full audit trail. Anti-cheat: client-side prediction corrected by authoritative state every tick. Latency compensation: 100ms max.',
      triggerKeywords: ['game', 'player', 'state'],
      tags: ['technical'],
      domainFocus: ['Game Development', 'State Management', 'Network Engineering'],
      toneProfile: { tone: 'Analytical, fairness-oriented', avoid: 'Client-trusting assumptions' },
      socraticTrigger: 'Is this state change client-authoritative or server-verified?',
      uncertaintyProtocol: 'When in doubt, reject the client update and request resync.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'State transition tables', clarity: 'Document authoritative vs predicted state separately', compliance: 'Anti-cheat logging for fraud analysis' }
    },
    {
      id: '_demo_drift',
      text: 'Context drift mitigation: system instructions re-injected every turn. Token compression cannot drop critical rules. Persona and formatting maintained reliably past 30+ turns without degradation.',
      triggerKeywords: ['context', 'drift', 'session'],
      tags: ['core'],
      domainFocus: ['AI Safety', 'Session Management', 'Prompt Engineering'],
      toneProfile: { tone: 'Educational, confident, solution-oriented', avoid: 'Fear-mongering, unsubstantiated claims' },
      socraticTrigger: 'What specific instruction was lost when context drifted?',
      uncertaintyProtocol: 'Verify re-injection by checking model output against original instructions.',
      turnsTotal: 10,
      turnsRemaining: 10,
      outputRequirements: { format: 'Before/after comparison', clarity: 'Show what was lost and what CA restored', compliance: 'N/A — this is a capability demonstration' }
    }
  ];

  /* ── Pre-built scenarios that demonstrate keyword matching ── */
  var SCENARIOS = [
    { label: 'Ask about sales',          text: 'What are our latest sales figures?' },
    { label: 'Request code example',     text: 'can you show me a python example?' },
    { label: 'Meeting follow-up',        text: 'Summarize key decisions from our strategy meeting' },
    { label: 'TypeScript code',          text: 'Write a typescript function for data fetching' },
    { label: 'Compliance check',         text: 'What are our compliance requirements for this client?' },
    { label: 'Patient diagnosis',        text: 'Document this patient diagnosis in clinical format' },
    { label: 'Security incident',        text: 'A security breach has been detected, what do we do?' },
    { label: 'Checkout debug',           text: 'The cart checkout is failing on payment processing' },
    { label: 'Game state sync',          text: 'The player position seems desynced from the server' },
    { label: 'Context drift',            text: 'How do we prevent context drift in long sessions?' },
    { label: 'Custom...',               text: '' }
  ];

  /* ── Simulator State (sandboxed — never mutates real storage) ── */
  var simState = {
    status: 'idle',
    loadedAnchors: [],
    simInput: '',
    simCleanedInput: '',
    matchedAnchors: [],
    detectedKeywords: [],
    consumptionLog: [],
    injectionBlock: '',
    turnsConsumedTotal: 0
  };

  var escapeHandler = null;
  var detectTimer = null;

  /* ── Init: wait for dependencies ── */
  function init() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(init, 100);
      return;
    }
    shared = window.__ca.shared;
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════════ */

  function openPlayground() {
    if (!shared) { init(); setTimeout(openPlayground, 200); return; }
    closePlayground();

    simState.loadedAnchors = JSON.parse(JSON.stringify(DEMO_ANCHORS));
    simState.turnsConsumedTotal = 0;
    simState.status = 'idle';
    simState.simInput = '';
    simState.simCleanedInput = '';
    simState.matchedAnchors = [];
    simState.detectedKeywords = [];
    simState.consumptionLog = [];
    simState.injectionBlock = '';
    renderPlayground();
  }

  function closePlayground() {
    if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
    var overlay = shared.$id('ca-sim-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
  }

  function resetPlayground() {
    simState.turnsConsumedTotal = 0;
    simState.simInput = '';
    simState.simCleanedInput = '';
    simState.matchedAnchors = [];
    simState.detectedKeywords = [];
    simState.consumptionLog = [];
    simState.injectionBlock = '';
    simState.status = 'idle';
    /* Reset per-anchor remaining turns */
    for (var ri = 0; ri < simState.loadedAnchors.length; ri++) {
      simState.loadedAnchors[ri].turnsRemaining = simState.loadedAnchors[ri].turnsTotal || 10;
    }
    updatePlayground();
  }

  /* ══════════════════════════════════════════════════════════════
     SIMULATION ENGINE (mirrors content.js logic exactly)
     ══════════════════════════════════════════════════════════════ */

  function compileBehaviorBlock(anchor) {
    return window.__ca.simulatorMath.compileBehaviorBlock(anchor);
  }

  function matchKeywords(anchors, text) {
    return window.__ca.simulatorMath.matchKeywords(anchors, text);
  }

  function stripKeywords(text, matchedAnchors) {
    return window.__ca.simulatorMath.stripKeywords(text, matchedAnchors);
  }

  function compileInjectionBlock(matchedAnchors) {
    return window.__ca.simulatorMath.compileInjectionBlock(matchedAnchors);
  }

  function runSimulation() {
    if (simState.status === 'detecting') return;

    var input = simState.simInput.trim();
    if (!input) return;

    var available = simState.loadedAnchors;

    simState.status = 'detecting';

    /* Phase 1: show scanning animation */
    var detectBubble = renderDetectionBubble('scanning');
    updatePlayground();

    detectTimer = setTimeout(function() {
      detectTimer = null;

      /* Run keyword matching */
      var result = matchKeywords(available, input);
      simState.matchedAnchors = result.matchedAnchors;
      simState.detectedKeywords = result.detectedKeywords;

      /* Run keyword stripping */
      simState.simCleanedInput = stripKeywords(input, simState.matchedAnchors);

      /* Compile injection block */
      simState.injectionBlock = compileInjectionBlock(
        simState.matchedAnchors
      );

      /* Log consumption and decrement per-anchor turns */
      if (simState.matchedAnchors.length > 0) {
        for (var i = 0; i < simState.matchedAnchors.length; i++) {
          simState.consumptionLog.push({
            keyword: simState.detectedKeywords[i] || 'manual',
            anchorId: simState.matchedAnchors[i].id,
            anchorText: simState.matchedAnchors[i].text.substring(0, 60),
            timestamp: Date.now()
          });
          if (typeof simState.matchedAnchors[i].turnsRemaining === 'number') {
            simState.matchedAnchors[i].turnsRemaining = Math.max(0, simState.matchedAnchors[i].turnsRemaining - 1);
          }
        }
        simState.turnsConsumedTotal += simState.matchedAnchors.length;
      }

      simState.status = 'result';
      updatePlayground();
    }, 800);
  }

  function selectScenario(index) {
    if (typeof index !== 'number' || isNaN(index) || index < 0 || index >= SCENARIOS.length) return;
    simState.simInput = SCENARIOS[index].text;
    simState.status = 'ready';
    var inputEl = shared.$id('ca-sim-input');
    if (inputEl) inputEl.value = simState.simInput;
    updatePlayground();
  }

  /* ══════════════════════════════════════════════════════════════
     RENDERING
     ══════════════════════════════════════════════════════════════ */

  function renderPlayground() {
    var $create = shared.$create;
    var overlay = $create('div', { id: 'ca-sim-overlay', className: 'ca-sim-overlay' });
    var panel = $create('div', { className: 'ca-sim-panel' });

    /* ── Header ── */
    var header = $create('div', { className: 'ca-sim-header' });
    var title = $create('h2', { className: 'ca-editor-title', textContent: '\u26A1 CA Playground' });

    var headerActions = $create('div', { className: 'ca-header-actions' });
    var closeBtn = $create('button', { className: 'ca-panel-close', 'data-action': 'close-playground', 'aria-label': 'Close Playground' });
    closeBtn.appendChild(window.__ca.shared.$icon('0 0 24 24', [{ tag: 'path', attrs: { d: 'M18 6L6 18M6 6l12 12' } }]));
    headerActions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(headerActions);
    panel.appendChild(header);

    /* ── Toolbar ── */
    var toolbar = $create('div', { className: 'ca-sim-toolbar' });

    var scenarioLabel = $create('span', { className: 'ca-sim-toolbar-label', textContent: 'Scenario:' });
    toolbar.appendChild(scenarioLabel);

    var scenarioSelect = $create('select', { className: 'ca-filter-select ca-sim-scenario-select', 'data-action': 'select-scenario', 'aria-label': 'Pick a scenario' });
    var placeholderOpt = $create('option', { value: 'select', disabled: true, selected: true, textContent: 'Select scenario\u2026' });
    scenarioSelect.appendChild(placeholderOpt);
    for (var s = 0; s < SCENARIOS.length; s++) {
      var opt = $create('option', { value: String(s), textContent: SCENARIOS[s].label });
      scenarioSelect.appendChild(opt);
    }
    toolbar.appendChild(scenarioSelect);

    var resetBtn = $create('button', { className: 'ca-btn-bulk-action', 'data-action': 'playground-reset', textContent: 'Reset' });
    toolbar.appendChild(resetBtn);

    panel.appendChild(toolbar);

    /* ── Body (left: KB, right: Chat) ── */
    var body = $create('div', { className: 'ca-sim-body' });

    var leftCol = $create('div', { className: 'ca-sim-left' });
    var kbTitle = $create('div', { className: 'ca-sim-col-header', textContent: 'Knowledge Bank' });
    leftCol.appendChild(kbTitle);
    var kbList = $create('div', { id: 'ca-sim-kb-list', className: 'ca-sim-kb-list' });
    leftCol.appendChild(kbList);
    body.appendChild(leftCol);

    var rightCol = $create('div', { className: 'ca-sim-right' });
    var chatTitle = $create('div', { className: 'ca-sim-col-header', textContent: 'Simulated Chat' });
    rightCol.appendChild(chatTitle);
    var chatArea = $create('div', { id: 'ca-sim-chat', className: 'ca-sim-chat' });
    rightCol.appendChild(chatArea);

    var inputRow = $create('div', { className: 'ca-sim-input-row' });
    var inputEl = $create('input', { id: 'ca-sim-input', className: 'ca-sim-input', 'data-action': 'playground-input', type: 'text', placeholder: shared.esc('Type a message or pick a scenario...'), 'aria-label': 'Simulated input' });
    inputRow.appendChild(inputEl);
    var simBtn = $create('button', { className: 'ca-btn-bulk-action', 'data-action': 'simulate-inject', textContent: '\u25B6 Simulate Injection' });
    inputRow.appendChild(simBtn);
    rightCol.appendChild(inputRow);
    body.appendChild(rightCol);

    panel.appendChild(body);

    /* ── Footer: Turn Meter ── */
    var footer = $create('div', { className: 'ca-sim-stats' });
    var meterContainer = $create('div', { id: 'ca-sim-meter', className: 'ca-sim-meter' });
    footer.appendChild(meterContainer);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    shared.$append(overlay);

    /* ── Escape handler ── */
    escapeHandler = function(e) {
      if (e.key === 'Escape') closePlayground();
    };
    document.addEventListener('keydown', escapeHandler);

    setupPlaygroundEvents(overlay);

    /* Show welcome state */
    updatePlayground();
  }

  function updatePlayground() {
    var $create = shared.$create;
    renderKnowledgeBank();
    renderChat();
    renderTurnMeter();
    var inputEl = shared.$id('ca-sim-input');
    if (inputEl && simState.simInput) inputEl.value = simState.simInput;
  }

  function renderKnowledgeBank() {
    var kbList = shared.$id('ca-sim-kb-list');
    if (!kbList) return;
    while (kbList.firstChild) kbList.removeChild(kbList.firstChild);

    var anchors = simState.loadedAnchors;
    if (!anchors || anchors.length === 0) {
      var emptyMsg = shared.$create('div', { className: 'ca-sim-kb-empty', textContent: shared.esc('No anchors loaded. Close and reopen the playground to reload demo anchors.') });
      kbList.appendChild(emptyMsg);
      return;
    }

    var $create = shared.$create;
    var matchedIds = {};
    for (var m = 0; m < simState.matchedAnchors.length; m++) {
      matchedIds[simState.matchedAnchors[m].id] = true;
    }

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var card = $create('div', { className: 'ca-sim-kb-card' + (matchedIds[a.id] ? ' matched' : '') });

      var numBadge = $create('span', { className: 'ca-sim-kb-num', textContent: '#' + (i + 1) });
      card.appendChild(numBadge);

      /* Text (truncated) */
      var textEl = $create('div', { className: 'ca-sim-kb-text', textContent: shared.esc(a.text.length > 80 ? a.text.substring(0, 80) + '\u2026' : a.text) });
      card.appendChild(textEl);

      /* Footer row: keywords + behavior badge + turns */
      var footerRow = $create('div', { className: 'ca-sim-kb-footer' });

      if (a.triggerKeywords && a.triggerKeywords.length > 0) {
        var kwSpan = $create('span', { className: 'ca-sim-kw', textContent: shared.esc('KW: ' + a.triggerKeywords.join(', ')) });
        footerRow.appendChild(kwSpan);
      }

      /* Behavior badge */
      if (a.toneProfile || (a.domainFocus && a.domainFocus.length > 0) || a.socraticTrigger || a.uncertaintyProtocol || a.outputRequirements) {
        var bBadge = $create('span', { className: 'ca-behavior-badge', textContent: 'B' });
        footerRow.appendChild(bBadge);
      }

      /* Turns pill (per-anchor remaining / total) */
      var displayTotal = a.turnsTotal || 10;
      var displayRemaining = typeof a.turnsRemaining === 'number' ? a.turnsRemaining : displayTotal;
      var pillClass = 'ca-sim-turns-pill';
      if (displayRemaining <= 3 && displayRemaining > 0) pillClass += ' expiring';
      else if (displayRemaining <= 0) pillClass += ' expired';
      var turnPill = $create('span', { className: pillClass, textContent: shared.esc(displayRemaining + '/' + displayTotal) });
      footerRow.appendChild(turnPill);

      card.appendChild(footerRow);
      kbList.appendChild(card);
    }
  }

  function renderChat() {
    var chatArea = shared.$id('ca-sim-chat');
    if (!chatArea) return;
    while (chatArea.firstChild) chatArea.removeChild(chatArea.firstChild);

    var $create = shared.$create;

    if (simState.status === 'idle') {
      var welcome = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-welcome', textContent: shared.esc('Demo anchors loaded. Pick a scenario or type a message to test CA\u2019s trigger detection.') });
      chatArea.appendChild(welcome);
      return;
    }

    /* 2. Detection phase */
    if (simState.status === 'detecting') {
      var scanBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-detect' });
      scanBubble.textContent = '\uD83D\uDD0D Scanning for trigger keywords\u2026';
      chatArea.appendChild(scanBubble);
      return;
    }

    /* 3. Result phase */
    if (simState.status === 'result') {
      if (simState.matchedAnchors.length > 0) {
        /* Detection results */
        for (var di = 0; di < simState.matchedAnchors.length; di++) {
          var mA = simState.matchedAnchors[di];
          var matchBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-matched' });
          matchBubble.textContent = '\u2705 Detected \u2018' + shared.esc(simState.detectedKeywords[di] || 'keyword') + '\u2019 \u2192 Anchor: ' + shared.esc(mA.text.substring(0, 40));
          chatArea.appendChild(matchBubble);
        }

        /* Keyword stripping info */
        if (simState.simCleanedInput !== simState.simInput) {
          var stripBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-info' });
          stripBubble.textContent = '\u2702\uFE0F Keywords stripped: "' + shared.esc(simState.simCleanedInput) + '"';
          chatArea.appendChild(stripBubble);
        }

        /* Injected context block */
        if (simState.injectionBlock) {
          var injectBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-inject' });
          var injectLabel = $create('div', { className: 'ca-sim-chat-label', textContent: 'Injected Context:' });
          injectBubble.appendChild(injectLabel);
          var preBlock = $create('pre', { className: 'ca-sim-inject-block' });
          preBlock.textContent = shared.esc(simState.injectionBlock);
          injectBubble.appendChild(preBlock);
          chatArea.appendChild(injectBubble);
        }

        /* Result summary */
        var resultBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-result' });
        resultBubble.textContent = '\uD83D\uDFE2 Injection complete \u00B7 Turns consumed: ' + simState.matchedAnchors.length;
        chatArea.appendChild(resultBubble);
      } else {
        var noMatchBubble = $create('div', { className: 'ca-sim-chat-bubble ca-sim-chat-info' });
        noMatchBubble.textContent = shared.esc('No trigger keywords matched. Add trigger keywords to your anchors in the editor, or try different text.');
        chatArea.appendChild(noMatchBubble);
      }
    }
  }

  function renderDetectionBubble() {
    /* Just a marker for state transition — updatePlayground renders the actual bubble */
  }

  function renderTurnMeter() {
    var meterContainer = shared.$id('ca-sim-meter');
    if (!meterContainer) return;
    while (meterContainer.firstChild) meterContainer.removeChild(meterContainer.firstChild);

    var $create = shared.$create;
    var consumed = simState.turnsConsumedTotal;
    var totalAnchors = simState.loadedAnchors.length;

    var statusText = consumed === 0
      ? '\uD83D\uDFE2 No turns consumed yet — simulate an injection to begin'
      : '\uD83D\uDFE2 ' + consumed + ' turn' + (consumed !== 1 ? 's' : '') + ' consumed in this session';

    var statusEl = $create('span', { className: 'ca-sim-meter-status', textContent: statusText });
    meterContainer.appendChild(statusEl);

    /* Per-anchor breakdown from consumption log */
    var perAnchor = {};
    for (var pi = 0; pi < simState.consumptionLog.length; pi++) {
      var entry = simState.consumptionLog[pi];
      perAnchor[entry.anchorId] = (perAnchor[entry.anchorId] || 0) + 1;
    }

    if (consumed > 0 && simState.consumptionLog.length > 0) {
      var anchorIds = [];
      for (var ai = 0; ai < simState.loadedAnchors.length; ai++) {
        anchorIds.push(simState.loadedAnchors[ai].id);
      }
      var parts = [];
      for (var ak = 0; ak < anchorIds.length; ak++) {
        var aid = anchorIds[ak];
        var count = perAnchor[aid];
        if (count) {
          var entryText = '#' + (ak + 1) + ' (' + count + (count > 1 ? ' turns' : ' turn') + ')';
          var entrySpan = $create('span', { className: count >= 5 ? 'ca-sim-meter-warn' : '', textContent: entryText });
          parts.push(entrySpan);
        }
      }
      if (parts.length > 0) {
        var detailEl = $create('div', { className: 'ca-sim-meter-detail' });
        for (var ej = 0; ej < parts.length; ej++) {
          detailEl.appendChild(parts[ej]);
          if (ej < parts.length - 1) {
            detailEl.appendChild($create('span', { className: 'ca-sim-meter-sep', textContent: '  |  ' }));
          }
        }
        meterContainer.appendChild(detailEl);
      }
    }

    var statsEl = $create('span', { className: 'ca-sim-stats-line', textContent: shared.esc('Anchors loaded: ' + totalAnchors) });
    meterContainer.appendChild(statsEl);

    /* CMA warning: fire when any single anchor reaches 5+ turns consumed.
       Show the most recently active anchor at or above the threshold. */
    var warnAnchorIdx = -1;
    for (var ri = simState.consumptionLog.length - 1; ri >= 0; ri--) {
      var rAnchorId = simState.consumptionLog[ri].anchorId;
      if (perAnchor[rAnchorId] && perAnchor[rAnchorId] >= 5) {
        for (var fi = 0; fi < simState.loadedAnchors.length; fi++) {
          if (simState.loadedAnchors[fi].id === rAnchorId) {
            warnAnchorIdx = fi;
            break;
          }
        }
        break;
      }
    }
    if (warnAnchorIdx >= 0) {
      var warnCount = perAnchor[simState.loadedAnchors[warnAnchorIdx].id];
      var cmaWarn = $create('div', { className: 'ca-sim-cma-warning', textContent: shared.esc('\u26A0\uFE0F Anchor #' + (warnAnchorIdx + 1) + ' has used ' + warnCount + ' turns \u2014 nearing depletion. Reset to start fresh.') });
      meterContainer.appendChild(cmaWarn);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     EVENT DELEGATION
     ══════════════════════════════════════════════════════════════ */

  function setupPlaygroundEvents(overlay) {
    if (!overlay) return;

    /* Click delegation */
    overlay.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;

      if (action === 'close-playground') {
        closePlayground();
      } else if (action === 'simulate-inject') {
        runSimulation();
      } else if (action === 'playground-reset') {
        resetPlayground();
      }
    });

    /* Change delegation (for select elements) */
    overlay.addEventListener('change', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;

      if (action === 'select-scenario') {
        var idx = parseInt(target.value, 10);
        selectScenario(idx);
      }
    });

    /* Input listener for the text input */
    overlay.addEventListener('input', function(e) {
      var target = e.target.closest('[data-action="playground-input"]');
      if (!target) return;
      simState.simInput = target.value || '';
      if (simState.status === 'result' || simState.status === 'detecting') {
        simState.status = 'ready';
        updatePlayground();
      }
    });

    /* Enter key submits simulation (Shift+Enter inserts newline) */
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        var target = e.target.closest('[data-action="playground-input"]');
        if (target) {
          e.preventDefault();
          runSimulation();
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════ */

  function docNS(ns, tag) {
    return document.createElementNS(ns, tag);
  }

  /* ══════════════════════════════════════════════════════════════
     EXPORTS
     ══════════════════════════════════════════════════════════════ */

  window.__ca = window.__ca || {};
  window.__ca.simulator = {
    open: openPlayground,
    close: closePlayground,
    reset: resetPlayground
  };

  init();
})();
