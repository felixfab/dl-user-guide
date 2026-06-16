(function() {
  'use strict';

  var CONFIG_URL = 'https://raw.githubusercontent.com/felixfab/ca-config/refs/heads/main/ca-config.json';

  var PLATFORM_SELECTORS = {
    gemini: {
      input: ["div[role=\"textbox\"][aria-label=\"Enter a prompt for Gemini\"]", "div[role=\"textbox\"][aria-label=\"Ask Gemini\"]", "div[role=\"textbox\"][aria-label=\"Ask anything\"]", "div[role=\"textbox\"][contenteditable=\"true\"]"],
      sendButton: ["button[aria-label=\"Send message\"]", "[data-test-id=\"send-button-container\"] button", ".send-button button"],
      chatHistory: ["infinite-scroller[data-test-id=\"chat-history-container\"]", ".chat-history", "message-list", ".conversation-container", "[data-test-id=\"conversation-container\"]", "main", "#chat-history", "[data-test-id=\"conversation\"]", "[role=\"feed\"]", "[role=\"log\"]"]
    }
  };

  var PLATFORM_MSG_DETECTION = {
    gemini: {
      msgIdSelectors: ["user-query", "model-response", ".conversation-container", "ms-chat-turn", "[data-test-id=\"conversation-turn\"]", "[data-test-id=\"message\"]", "[data-message-id]", "[data-e2e-id]"],
      userIndicators: ["user-query", ".user-query", "[data-test-id=\"user-query\"]", ".user-profile-picture", "[data-test-id=\"user-input\"]", "[data-role=\"user\"]", "[data-message-role=\"user\"]"],
      textPatterns: ["Enter a prompt", "Ask Gemini", "Ask anything"]
    }
  };

  var currentPlatform = window.__ca.detectPlatform();
  var BUILTIN_SELECTORS = PLATFORM_SELECTORS[currentPlatform];
  var BUILTIN_MSG_DETECTION = PLATFORM_MSG_DETECTION[currentPlatform];

  var activeSelectors = BUILTIN_SELECTORS;
  var activeMsgDetection = BUILTIN_MSG_DETECTION;

  function mergeSelectors(configSel) {
    if (!configSel) return BUILTIN_SELECTORS;
    var fallback = BUILTIN_SELECTORS || {};
    var keys = ['input', 'sendButton', 'chatHistory'];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      out[k] = configSel[k] && configSel[k].length ? configSel[k] : (fallback[k] || []);
    }
    return out;
  }

  var lastUserMessageIndex = -1;
  var selectionButton = null;
  var toast = null;
  var inputSetup = false;
  var slashCommandsInitialized = false;
  var cmdDropdown = null;
  var cmdInputEl = null;
  var cmdCursorRect = null;
  var cmdCommandType = null;
  var slashDebounceTimer = null;
  var cmdSavedBeforeText = null;
  var cmdCollapsedGroups = window.__ca.state.collapsedGroups || {};
  var cmdLastMatches = [];
  var cmdLastCommandType = '';
  var healthCheckCount = 0;
  var observerDecrementBlocked = false;
  var applyDebounceTimer = null;
  var lastInputText = '';
  var _lastPromptTokens = 0;
  var _lastResponseText = '';
  var _pendingOutputUpdates = [];
  var _flushScheduled = false;
  var _processedModelResponses = new WeakSet();
  var hasEverBeenLive = false;
  var navInterval = null;
  var turnDecrementObserver = null;
  var chatHistoryRetryTimer = null;

  var REMINDER_INTERVAL = 5;
  var conversationTurn = 0;
  var checkpointToastShown = false;

  function buildCheckpointText() {
    var hasProfile = !!window.__ca.state.profileSystemInstruction;
    var hasConstraints = window.__ca.storage.getActiveConstraints().length > 0;
    var hasBehavioral = filterByScope(window.__ca.storage.getActive()).some(window.__ca.contentMath.hasBehavioralFields);
    return window.__ca.contentMath.buildCheckpointText(hasProfile, hasConstraints, hasBehavioral);
  }

  /* ── Analytics helpers ── */
  function _pushTurnToAnalytics(inputTokens, outputTokens, promptText, responseText) {
    var a = window.__ca.state.analytics;
    a.prompts++;

    var activeAnchors = window.__ca.storage.getActive();
    var anchorKeywords = [];
    for (var ai = 0; ai < activeAnchors.length; ai++) {
      var kw = (activeAnchors[ai].text || '').replace(/^\s*\d+[.)]\s*/, '').split(' ').slice(0, 3).join(' ');
      anchorKeywords.push(kw || '(unnamed)');
    }

    var pt = (promptText || '');
    var rt = (responseText || '');
    var turnEntry = {
      turn: a.turns.length + 1,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      activeAnchors: anchorKeywords,
      promptText: pt.length > 200 ? pt.slice(0, 197) + '...' : pt,
      responseText: rt.length > 200 ? rt.slice(0, 197) + '...' : rt
    };
    a.turns.push(turnEntry);

    if (a.turns.length > 100) a.turns.shift();

    window.__ca.storage.setAnalytics(a);

    window.__ca.events.emit('analytics:updated');
  }

  function _resetAnalyticsState() {
    var a = window.__ca.state.analytics;
    a.prompts = 0;
    a.turns = [];
    _lastPromptTokens = 0;
    _lastResponseText = '';
    _pendingOutputUpdates = [];
    _flushScheduled = false;
  }

  /* ── Multi-slot deferred output-token resolution (fires after streaming completes) ── */
  function _flushPendingUpdates() {
    _flushScheduled = false;
    var remaining = [];
    var stillPending = false;

    for (var i = 0; i < _pendingOutputUpdates.length; i++) {
      var entry = _pendingOutputUpdates[i];
      if (!entry.respEl.isConnected) continue;
      if (window.__ca.hostAdapter && window.__ca.hostAdapter.isStreaming()) {
        remaining.push(entry);
        stillPending = true;
        continue;
      }

      var result = _computeOutputTokens(entry.respEl);
      var a = window.__ca.state.analytics;
      if (entry.turnNumber) {
        for (var t = 0; t < a.turns.length; t++) {
          if (a.turns[t].turn === entry.turnNumber) {
            a.turns[t].outputTokens = result.totalTokens;
            var pr = result.responseText || '';
            a.turns[t].responseText = pr.length > 200 ? pr.slice(0, 197) + '...' : pr;
            break;
          }
        }
      }
    }

    if (_pendingOutputUpdates.length > 0) {
      window.__ca.storage.setAnalytics(window.__ca.state.analytics);
    }

    _pendingOutputUpdates = remaining;
    if (stillPending || remaining.length > 0) {
      _flushScheduled = true;
      requestAnimationFrame(_flushPendingUpdates);
    }
  }

  /* ── Compute output tokens from DOM blocks with usage footer fallback ── */
  function _computeOutputTokens(respEl) {
    var blocks = window.__ca.hostAdapter.getContentBlocks(respEl);
    var codeTokens = 0;
    var proseTokens = 0;
    var responseText = '';
    for (var bi = 0; bi < (blocks && blocks.length || 0); bi++) {
      var blockText = blocks[bi].el ? (blocks[bi].el.textContent || '') : '';
      if (blocks[bi].type === 'code') {
        codeTokens += window.__ca.dashboardMath.estimateTokens(blockText, true);
      } else {
        proseTokens += window.__ca.dashboardMath.estimateTokens(blockText, false);
      }
      responseText += (bi > 0 ? '\n\n' : '') + blockText;
    }
    var total = codeTokens + proseTokens;
    var usage = window.__ca.hostAdapter.extractUsageInfo(respEl);
    if (usage && usage.outputChars) {
      total = Math.round(usage.outputChars / 3.5);
    }
    return { totalTokens: total, responseText: responseText };
  }

  var chatHistoryRetryCount = 0;
  var MAX_CHAT_RETRIES = 15;
  var extensionConfig = null;
  var profileConfigJson = null;

  /* ── CMA (Context Management Advisor) ── */
  var sessionTurnCount = 0;
  var CMA_THRESHOLD = 5;
  var cmaBannerEl = null;
  var cmaDismissed = false;

  function resolveSelector(selectorList) {
    if (window.__ca.hostAdapter) {
      return window.__ca.hostAdapter.resolveSelector(selectorList);
    }
    for (var i = 0; i < selectorList.length; i++) {
      var el = document.querySelector(selectorList[i]);
      if (el) return el;
    }
    return null;
  }

  function resolveNodeSelector(node, selectorList) {
    if (window.__ca.hostAdapter) {
      return window.__ca.hostAdapter.resolveNodeSelector(node, selectorList);
    }
    for (var i = 0; i < selectorList.length; i++) {
      var el = node.querySelector(selectorList[i]);
      if (el) return el;
    }
    return null;
  }

  function filterByScope(anchors) {
    return window.__ca.contentMath.filterByScope(anchors, window.location.origin + window.location.pathname);
  }

  function checkHealth() {
    var inputOk = resolveSelector(activeSelectors.input) !== null;
    var sendOk = true;
    var inConversation = /\/chat\/|\/c\//.test(window.location.pathname);
    var chatOk = inConversation
        ? resolveSelector(activeSelectors.chatHistory) !== null
        : true;
    var allOk = inputOk && chatOk;
    var anyOk = inputOk || chatOk;
    window.__ca.state.health = allOk ? 'live' : anyOk ? 'degraded' : 'offline';
    window.__ca.state.healthReason = allOk ? null : (
      hasEverBeenLive && !inputOk ? 'selector-input-missing' :
      hasEverBeenLive && !chatOk ? 'selector-chat-missing' :
      hasEverBeenLive ? 'selector-all-missing' : null
    );
    window.__ca.events.emit('health:changed', window.__ca.state.health);
    if (allOk) hasEverBeenLive = true;

    if (allOk) {
      healthCheckCount = 0;
    } else {
      if (hasEverBeenLive && !inputOk) { inputSetup = false; conversationTurn = 0; checkpointToastShown = false; }
      healthCheckCount++;
      if (healthCheckCount === 3 && hasEverBeenLive) {
        var missing = [];
        if (!inputOk) missing.push('input field');
        if (!chatOk) missing.push('chat history');
        showToast('Gemini UI may have changed — ' + missing.join(', ') + ' not found. Try Alt+O for manual anchor use.', 'warning');
      }
      if (healthCheckCount === 20 && !hasEverBeenLive) {
        var missing2 = [];
        if (!inputOk) missing2.push('input field');
        if (!chatOk) missing2.push('chat history');
        showToast('Could not detect Gemini interface — ' + missing2.join(', ') + ' not found. Ensure you are on gemini.google.com.', 'warning');
      }
    }

    if (!anyOk) {
      setTimeout(checkHealth, 1000);
    } else if (!allOk && healthCheckCount < 20) {
      // Use MutationObserver for SPA deferred rendering
      waitForReady(function() { checkHealth(); });
    }
  }

  function waitForReady(callback) {
    var inConv = /\/chat\/|\/c\//.test(window.location.pathname);
    var inputOk = resolveSelector(activeSelectors.input) !== null;
    var chatOk = inConv ? resolveSelector(activeSelectors.chatHistory) !== null : true;
    if (inputOk && chatOk) { setTimeout(callback, 0); return; }

    var observer = new MutationObserver(function() {
      var iOk = resolveSelector(activeSelectors.input) !== null;
      var cOk = inConv ? resolveSelector(activeSelectors.chatHistory) !== null : true;
      if (iOk && cOk) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 30000);
  }

  /* ══════════════════════════════════════════════════════════════
     Navigation observer — polls location.pathname to detect SPA
     route changes on gemini.google.com. Gemini is a single-page
     app that does not emit popstate/hashchange for internal
     navigation (e.g. /c/ → /chat/). The check is a lightweight
     string comparison every 500ms with zero DOM touches. There is
     no event-driven alternative for SPA route detection in MV3
     content scripts. Cleaned on pagehide.
     ══════════════════════════════════════════════════════════════ */
  function setupNavigationObserver() {
    var lastPath = location.pathname;
    navInterval = setInterval(function() {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        inputSetup = false;
        healthCheckCount = 0;
        chatHistoryRetryCount = 0;
        conversationTurn = 0;
        checkpointToastShown = false;
        resetCMA();
        _resetAnalyticsState();
        setupTurnDecrementObserver();
        setTimeout(checkHealth, 800);
      }
    }, 500);
  }

  function loadConfig() {
    try {
      var cached = sessionStorage.getItem('ca_config');
      var cacheTs = sessionStorage.getItem('ca_config_ts');
      if (cached && cacheTs && (Date.now() - parseInt(cacheTs, 10) > 3600000)) {
        sessionStorage.removeItem('ca_config');
        sessionStorage.removeItem('ca_config_ts');
        cached = null;
      }
      if (cached) {
        var parsed = JSON.parse(cached);
        if (!parsed._v || parsed._v < 2) {
          sessionStorage.removeItem('ca_config');
          cached = null;
        }
      }
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed.platforms && parsed.platforms[currentPlatform]) {
          activeSelectors = mergeSelectors(parsed.platforms[currentPlatform].selectors);
          activeMsgDetection = parsed.platforms[currentPlatform].messageDetection || BUILTIN_MSG_DETECTION;
        } else {
          activeSelectors = mergeSelectors(parsed.selectors);
          activeMsgDetection = parsed.messageDetection || BUILTIN_MSG_DETECTION;
        }
        if (parsed.prompt_assembly) {
          if (typeof parsed.prompt_assembly !== 'object' ||
              !parsed.prompt_assembly.role_definition ||
              typeof parsed.prompt_assembly.role_definition !== 'string') {
            console.warn('[CA] Cached prompt_assembly has invalid structure, skipping');
          } else {
            profileConfigJson = parsed.prompt_assembly;
            seedProfileFromRemote();
          }
        } else {
          profileConfigJson = null;
        }
        if (parsed.extension_config) {
          extensionConfig = parsed.extension_config;
          if (extensionConfig.cmaThreshold) {
            CMA_THRESHOLD = Math.max(2, Math.min(20, extensionConfig.cmaThreshold));
          }
        }
        if (window.__ca.panel && window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
        setupTurnDecrementObserver();
        checkHealth();
        return;
      }
    } catch(e) {}

    var controller = new AbortController();
    var configTimeout = setTimeout(function() { controller.abort(); }, 10000);
    fetch(CONFIG_URL, { signal: controller.signal })
      .then(function(r) { clearTimeout(configTimeout); return r.json(); })
      .then(function(config) {
        if (!config || typeof config !== 'object' || (!config.selectors && !config.platforms && !config.messageDetection)) {
          throw new Error('Invalid config structure');
        }
        try { sessionStorage.setItem('ca_config', JSON.stringify(config)); } catch(e) {}
        try { sessionStorage.setItem('ca_config_ts', String(Date.now())); } catch(e) {}
        if (config.platforms && config.platforms[currentPlatform]) {
          activeSelectors = mergeSelectors(config.platforms[currentPlatform].selectors);
          activeMsgDetection = config.platforms[currentPlatform].messageDetection || BUILTIN_MSG_DETECTION;
        } else {
          activeSelectors = mergeSelectors(config.selectors);
          activeMsgDetection = config.messageDetection || BUILTIN_MSG_DETECTION;
        }
        if (config.prompt_assembly) {
          if (typeof config.prompt_assembly !== 'object' ||
              !config.prompt_assembly.role_definition ||
              typeof config.prompt_assembly.role_definition !== 'string') {
            console.warn('[CA] Remote config prompt_assembly has invalid structure, skipping');
          } else {
            profileConfigJson = config.prompt_assembly;
            seedProfileFromRemote();
          }
        } else {
          profileConfigJson = null;
        }
        if (config.extension_config) {
          extensionConfig = config.extension_config;
          if (extensionConfig.cmaThreshold) {
            CMA_THRESHOLD = Math.max(2, Math.min(20, extensionConfig.cmaThreshold));
          }
        }
        if (window.__ca.panel && window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
        setupTurnDecrementObserver();
        checkHealth();
      })
      .catch(function() {
        clearTimeout(configTimeout);
        activeSelectors = BUILTIN_SELECTORS;
        activeMsgDetection = BUILTIN_MSG_DETECTION;
        showToast('Remote config unavailable, using built-in selectors', 'warning');
        checkHealth();
      });
  }

  function init() {
    if (!window.__ca || !window.__ca.shared) {
      setTimeout(init, 100);
      return;
    }
    window.__ca.storage.setSessionId(window.__ca.shared.extractGeminiSessionId());
    window.__ca.state.analytics.sessionId = window.__ca.shared.extractGeminiSessionId();
    window.__ca.storage.init(function() {
      if (typeof window.__ca.storage.getAll !== 'function') {
        showToast('Storage failed to initialize. Try reloading the extension.', 'error');
        return;
      }
      /* Hydrate analytics from storage if session matches */
      var savedAnalytics = window.__ca.storage.getAnalytics();
      if (savedAnalytics && savedAnalytics.sessionId === window.__ca.state.analytics.sessionId) {
        window.__ca.state.analytics = savedAnalytics;
      }
      renderTriggerZone();
      renderToast();
      setupToastDismiss();
      window.__ca.panel.renderPanel();
      initSlashCommands();
      setupSelectionObserver();
      setupPromptInterceptor();
      setupConstraintInterceptor();
      setupTurnDecrementObserver();
      setupTriggerZoneHover();
      setupKeyboardShortcuts();
      setupTTLCleanup();
      setupIntervalCleanup();
      setupStorageErrorHandler();
      setupKeyGuard();
      setupNavigationObserver();
      loadActiveProfile();
      loadConfig();
      if (window.__ca.minimap && window.__ca.minimap.init) window.__ca.minimap.init();
      checkPendingSessionImports();
      if (window.__ca.hostAdapter) {
        window.__ca.events.emit('health:report', window.__ca.hostAdapter.getHealthReport());
        console.group('[CA] Selector Health');
        var rep = window.__ca.hostAdapter.getHealthReport();
        for (var g in rep) {
          var r = rep[g];
          var status = r.matched === r.total ? '\u2713' : (r.matched === 0 ? '\u2717' : '~');
          console.log(status, g + ':', r.matched + '/' + r.total + ' matched');
        }
        console.groupEnd();
      }
    });
  }

  function setupTTLCleanup() {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        setupTurnDecrementObserver();
        window.__ca.storage.checkExpiredTTLs();
        window.__ca.storage.checkExpiredTemplateTTLs();
        window.__ca.events.emit('anchors:changed');
        healthCheckCount = 0;
        conversationTurn = 0;
        checkpointToastShown = false;
        setTimeout(checkHealth, 800);
      }
    });
  }

  function setupIntervalCleanup() {
    document.addEventListener('pagehide', function() {
      if (navInterval) { clearInterval(navInterval); navInterval = null; }
      if (turnDecrementObserver) { turnDecrementObserver.disconnect(); turnDecrementObserver = null; }
      if (chatHistoryRetryTimer) { clearTimeout(chatHistoryRetryTimer); chatHistoryRetryTimer = null; }
      if (slashDebounceTimer) { clearTimeout(slashDebounceTimer); slashDebounceTimer = null; }
      if (applyDebounceTimer) { clearTimeout(applyDebounceTimer); applyDebounceTimer = null; }
      dismissCmdDropdown();
      removeSelectionButton();
      _pendingOutputUpdates = [];
      _flushScheduled = false;
      _processedModelResponses = new WeakSet();
      if (window.__ca.dashboard && window.__ca.dashboard.close) window.__ca.dashboard.close();
    });
  }

  function setupStorageErrorHandler() {
    window.__ca.events.on('storage:error', function(message) {
      showToast('Storage error: ' + message + '. Data may not be saved.', 'error');
    });
  }

  function setupKeyGuard() {
    window.__ca.ROOT.addEventListener('keydown', function(e) {
      e.stopPropagation();
    }, false);
  }

  function renderTriggerZone() {
    var $create = window.__ca.shared.$create;
    var $icon = window.__ca.shared.$icon;
    var zone = $create('div', { className: 'ca-trigger-zone', 'data-action': 'toggle-panel' });
    var icon = $create('div', { className: 'ca-trigger-icon' });
    icon.appendChild($icon('0 0 24 24', [
      { tag: 'path', attrs: { d: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z' } }
    ]));
    zone.appendChild(icon);
    window.__ca.shared.$append(zone);
  }

  function seedProfileFromRemote() {
    if (!profileConfigJson || typeof profileConfigJson !== 'object') return;
    var existing = window.__ca.storage.getAllProfiles();
    if (existing.length > 0) return;
    var name = profileConfigJson.role_definition || 'Default';
    window.__ca.storage.createProfile(name, profileConfigJson);
  }

  function loadActiveProfile() {
    var active = window.__ca.storage.getActiveProfile();
    if (active) {
      window.__ca.state.profileSystemInstruction = compileProfileSystemInstruction(active);
    } else {
      window.__ca.state.profileSystemInstruction = null;
    }
    if (window.__ca.panel && window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
  }

  function renderToast() {
    var toastEl = window.__ca.shared.$create('div', { id: 'ca-toast', className: 'ca-toast', 'data-action': 'dismiss-toast' });
    window.__ca.shared.$append(toastEl);
    toast = window.__ca.shared.$id('ca-toast');
  }

  function showToast(message, type) {
    if (!toast) {
      toast = window.__ca.shared.$id('ca-toast');
    }
    type = type || '';
    var editorOverlay = window.__ca.shared.$id('ca-behavior-editor-overlay') || window.__ca.shared.$id('ca-editor-overlay');
    if (editorOverlay && toast.parentNode !== editorOverlay) {
      editorOverlay.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'ca-toast visible ' + type;
    var duration = type === 'error' ? 5000 : 2500;
    setTimeout(function() {
      toast.className = 'ca-toast';
      if (editorOverlay && toast.parentNode === editorOverlay) {
        var root = window.__ca.shared.$id('ca-root') || window.__ca.ROOT;
        root.appendChild(toast);
      }
    }, duration);
  }

  function showClipboardConfirmToast(text) {
    var t = toast || window.__ca.shared.$id('ca-toast');
    if (!t) return;
    if (t._clipHandler) { t.removeEventListener('click', t._clipHandler); t._clipHandler = null; }
    if (t._clipTimer) { clearTimeout(t._clipTimer); t._clipTimer = null; }
    t.textContent = '';
    t.className = 'ca-toast visible warning';
    var preview = text.length > 60 ? text.substring(0, 57) + '...' : text;
    var msgSpan = window.__ca.shared.$create('span', { textContent: 'Create anchor from clipboard: "' + preview + '"?' });
    t.appendChild(msgSpan);
    var yesBtn = window.__ca.shared.$create('button', { className: 'ca-toast-undo-btn', textContent: 'Yes' });
    t.appendChild(yesBtn);
    var noBtn = window.__ca.shared.$create('button', { className: 'ca-toast-undo-btn', textContent: 'No' });
    t.appendChild(noBtn);
    var handler = function(e) {
      if (e.target === yesBtn) {
        var existing = window.__ca.storage.findByText(text);
        window.__ca.storage.createAnchor(text, window.location.href, 10);
        window.__ca.events.emit('anchors:changed');
        showToast('Anchor created from clipboard' + (existing.length > 0 ? ' — duplicate text exists' : ''), existing.length > 0 ? 'warning' : 'success');
      }
      t.className = 'ca-toast';
      t.textContent = '';
      t.removeEventListener('click', handler);
      t._clipHandler = null;
    };
    t.addEventListener('click', handler);
    t._clipHandler = handler;
    t._clipTimer = setTimeout(function() {
      t.className = 'ca-toast';
      t.textContent = '';
      t.removeEventListener('click', handler);
      t._clipHandler = null;
      t._clipTimer = null;
    }, 8000);
  }

  function setupToastDismiss() {
    window.__ca.ROOT.addEventListener('click', function(e) {
      if (e.target.closest('[data-action="dismiss-toast"]')) {
        if (toast) toast.className = 'ca-toast';
      }
      if (e.target.closest('[data-action="cma-export"]')) {
        cmaExportSummary();
      }
      if (e.target.closest('[data-action="cma-dismiss"]')) {
        cmaDismissed = true;
        removeCMABanner();
      }
      if (e.target.closest('[data-action="cma-new-chat"]')) {
        cmaNewChat();
      }
      if (e.target.closest('[data-action="close-summary"]')) {
        removeSummaryOverlay();
      }
      if (e.target.closest('[data-action="cma-copy-summary"]')) {
        var pre = window.__ca.shared.$one('.ca-summary-text');
        if (pre) {
          navigator.clipboard.writeText(pre.textContent).catch(function() {});
          var btn = e.target.closest('.ca-summary-copy-btn');
          if (btn) {
            btn.textContent = '';
            var checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            checkSvg.setAttribute('viewBox', '0 0 24 24');
            checkSvg.setAttribute('fill', 'none');
            checkSvg.setAttribute('stroke', 'currentColor');
            checkSvg.setAttribute('stroke-width', '2');
            var checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            checkPath.setAttribute('d', 'M20 6L9 17l-5-5');
            checkSvg.appendChild(checkPath);
            btn.appendChild(checkSvg);
            btn.classList.add('copied');
            setTimeout(function() {
              btn.classList.remove('copied');
              btn.textContent = '';
              var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svg.setAttribute('viewBox', '0 0 24 24');
              svg.setAttribute('fill', 'none');
              svg.setAttribute('stroke', 'currentColor');
              svg.setAttribute('stroke-width', '2');
              var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              p.setAttribute('d', 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1');
              svg.appendChild(p);
              var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              r.setAttribute('x', '9'); r.setAttribute('y', '9');
              r.setAttribute('width', '13'); r.setAttribute('height', '13');
              r.setAttribute('rx', '2');
              svg.appendChild(r);
              btn.appendChild(svg);
            }, 2000);
          }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════
     CMA (Context Management Advisor) — session turn warning
     ══════════════════════════════════════════════════════════════ */

  function resetCMA() {
    sessionTurnCount = 0;
    cmaDismissed = false;
    removeCMABanner();
  }

  function checkCMA() {
    sessionTurnCount++;
    if (sessionTurnCount >= CMA_THRESHOLD && !cmaDismissed && !cmaBannerEl) {
      renderCMABanner();
    }
  }

  function removeCMABanner() {
    if (cmaBannerEl) {
      var p = cmaBannerEl.parentNode;
      if (p) p.removeChild(cmaBannerEl);
      cmaBannerEl = null;
    }
  }

  function cmaSVG(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  function renderCMABanner() {
    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;
    var ns = 'http://www.w3.org/2000/svg';

    var banner = $create('div', { className: 'ca-cma-banner' });
    cmaBannerEl = banner;

    /* Icon row: warning SVG + title */
    var iconRow = $create('div', { className: 'ca-cma-icon-row' });

    var warnSvg = cmaSVG('M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z');
    var wl1 = document.createElementNS(ns, 'line'); wl1.setAttribute('x1','12'); wl1.setAttribute('y1','9'); wl1.setAttribute('x2','12'); wl1.setAttribute('y2','13'); warnSvg.appendChild(wl1);
    var wl2 = document.createElementNS(ns, 'line'); wl2.setAttribute('x1','12'); wl2.setAttribute('y1','17'); wl2.setAttribute('x2','12.01'); wl2.setAttribute('y2','17'); warnSvg.appendChild(wl2);
    warnSvg.setAttribute('class', 'ca-cma-warn-icon');
    iconRow.appendChild(warnSvg);

    var title = $create('span', { className: 'ca-cma-title' });
    title.textContent = 'Context Warning: ' + sessionTurnCount + ' turns used this session';
    iconRow.appendChild(title);
    banner.appendChild(iconRow);

    /* Body text */
    var bodyText = $create('div', { className: 'ca-cma-text' });
    bodyText.textContent = 'For best results, summarize your findings and start a fresh conversation to keep all anchors sharp.';
    banner.appendChild(bodyText);

    /* Buttons row */
    var btnRow = $create('div', { className: 'ca-cma-buttons' });

    /* Export Summary button */
    var exportBtn = $create('button', { className: 'ca-cma-btn ca-cma-primary', 'data-action': 'cma-export' });
    var copySvg = cmaSVG('M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1');
    var copyRect = document.createElementNS(ns, 'rect'); copyRect.setAttribute('x','9'); copyRect.setAttribute('y','9'); copyRect.setAttribute('width','13'); copyRect.setAttribute('height','13'); copyRect.setAttribute('rx','2'); copySvg.appendChild(copyRect);
    exportBtn.appendChild(copySvg);
    exportBtn.appendChild(document.createTextNode(' Export Summary'));
    btnRow.appendChild(exportBtn);

    /* Dismiss button */
    var dismissBtn = $create('button', { className: 'ca-cma-btn ca-cma-ghost', 'data-action': 'cma-dismiss', textContent: 'Dismiss' });
    btnRow.appendChild(dismissBtn);

    /* Start New Chat button */
    var newBtn = $create('button', { className: 'ca-cma-btn', 'data-action': 'cma-new-chat' });
    var sparkleSvg = cmaSVG('M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z');
    newBtn.appendChild(sparkleSvg);
    newBtn.appendChild(document.createTextNode(' Start New Chat'));
    btnRow.appendChild(newBtn);

    banner.appendChild(btnRow);
    window.__ca.shared.$append(banner);
  }

  function removeSummaryOverlay() {
    var ov = window.__ca.shared.$id('ca-summary-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  function buildSummaryText() {
    var lines = [];
    var d = new Date();
    lines.push('=== CA Session Summary ===');
    lines.push('Date: ' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
    lines.push('Session turns: ' + sessionTurnCount);
    lines.push('');

    var anchors = window.__ca.storage.getAll();
    var active = anchors.filter(window.__ca.panelMath.isActiveAnchor);
    if (active.length > 0) {
      lines.push('--- Active Anchors ---');
      for (var i = 0; i < active.length; i++) {
        var a = active[i];
        var preview = a.text ? a.text.substring(0, 80) : '(no text)';
        lines.push((i + 1) + '. ' + preview.replace(/\n/g, ' ') + ' \u2014 ' + a.turnsRemaining + '/' + a.turnsTotal + ' turns');
      }
      lines.push('');
    }

    var constraints = window.__ca.storage.getActiveConstraints();
    if (constraints && constraints.length > 0) {
      lines.push('--- Active Constraints ---');
      for (var j = 0; j < constraints.length; j++) {
        lines.push((j + 1) + '. ' + constraints[j].text.replace(/\n/g, ' '));
      }
      lines.push('');
    }

    var profile = window.__ca.storage.getActiveProfile();
    lines.push('--- Profile ---');
    lines.push(profile && profile.name ? profile.name : 'None');

    return lines.join('\n');
  }

  function showSummaryDialog(text) {
    removeSummaryOverlay();
    var $create = window.__ca.shared.$create;
    var ns = 'http://www.w3.org/2000/svg';
    var overlay = $create('div', { id: 'ca-summary-overlay', className: 'ca-summary-overlay' });

    var panel = $create('div', { className: 'ca-summary-panel' });

    var header = $create('div', { className: 'ca-summary-header' });
    var titleRow = $create('div', { className: 'ca-summary-title-row' });
    var hTitle = $create('span', { className: 'ca-editor-title', textContent: 'Session Summary' });
    titleRow.appendChild(hTitle);
    var copiedBadge = $create('span', { className: 'ca-summary-copied-badge', textContent: '\u2713 Copied' });
    titleRow.appendChild(copiedBadge);
    header.appendChild(titleRow);
    var closeBtn = $create('button', { className: 'ca-panel-close', 'data-action': 'close-summary', 'aria-label': 'Close summary' });
    var closeSvg = document.createElementNS(ns, 'svg');
    closeSvg.setAttribute('viewBox', '0 0 24 24');
    closeSvg.setAttribute('fill', 'none');
    closeSvg.setAttribute('stroke', 'currentColor');
    closeSvg.setAttribute('stroke-width', '2');
    var closePath = document.createElementNS(ns, 'path');
    closePath.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    closeSvg.appendChild(closePath);
    closeBtn.appendChild(closeSvg);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var body = $create('div', { className: 'ca-summary-body' });
    var codeBlock = $create('div', { className: 'ca-summary-code-block' });
    var pre = $create('pre', { className: 'ca-summary-text' });
    pre.textContent = text;
    codeBlock.appendChild(pre);

    var copyBtn = $create('button', { className: 'ca-summary-copy-btn', 'data-action': 'cma-copy-summary', 'aria-label': 'Copy to clipboard' });
    var copySvg = document.createElementNS(ns, 'svg');
    copySvg.setAttribute('viewBox', '0 0 24 24');
    copySvg.setAttribute('fill', 'none');
    copySvg.setAttribute('stroke', 'currentColor');
    copySvg.setAttribute('stroke-width', '2');
    var copyPath = document.createElementNS(ns, 'path');
    copyPath.setAttribute('d', 'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1');
    copySvg.appendChild(copyPath);
    var copyRect = document.createElementNS(ns, 'rect');
    copyRect.setAttribute('x', '9'); copyRect.setAttribute('y', '9');
    copyRect.setAttribute('width', '13'); copyRect.setAttribute('height', '13');
    copyRect.setAttribute('rx', '2');
    copySvg.appendChild(copyRect);
    copyBtn.appendChild(copySvg);
    codeBlock.appendChild(copyBtn);

    body.appendChild(codeBlock);
    panel.appendChild(body);

    overlay.appendChild(panel);
    window.__ca.shared.$append(overlay);

    setTimeout(function() { copiedBadge.classList.add('visible'); }, 100);
    setTimeout(function() { copiedBadge.classList.remove('visible'); }, 2500);
  }

  function cmaExportSummary() {
    var text = buildSummaryText();
    navigator.clipboard.writeText(text).catch(function() {});
    showSummaryDialog(text);
  }

  function cmaNewChat() {
    resetCMA();
    window.open('https://gemini.google.com/app', '_blank');
  }

  function getActiveConstraintsBlock() {
    var constraints = window.__ca.storage.getActiveConstraints();
    if (!constraints || constraints.length === 0) return '';

    var sorted = constraints.slice().sort(function(a, b) {
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });

    var parts = ['[Active constraints]'];
    for (var i = 0; i < sorted.length; i++) {
      var ct = sorted[i].text.replace(/^\d+\.\s*/, '');
      parts.push((i + 1) + '. ' + ct);
    }

    return parts.join('\n');
  }

  function compileProfileSystemInstruction(profile) {
    if (!profile) return null;

    var lines = ['<system_instruction>', ''];

    /* ## Role & Persona */
    if (profile.personaRole || (profile.promptAssembly && profile.promptAssembly.role_definition)) {
      var role = profile.personaRole || profile.promptAssembly.role_definition;
      lines.push('## Role & Persona');
      lines.push(role);
      lines.push('');
    }

    /* ## Domain Scope */
    var domainList = (profile.promptAssembly && profile.promptAssembly.domain_focus) || [];
    if (domainList.length > 0) {
      lines.push('## Domain Scope');
      lines.push('<domain_scope>' + domainList.join(', ') + '</domain_scope>');
      lines.push('');
    }

    /* ## Core Protocol (reasoning) */
    var reasoning = profile.reasoningProtocol || (profile.promptAssembly && profile.promptAssembly.reasoning_protocol);
    if (reasoning) {
      lines.push('## Core Protocol');
      var rLines = reasoning.split('\n');
      for (var ri = 0; ri < rLines.length; ri++) {
        lines.push('- ' + rLines[ri]);
      }
      lines.push('');
    }

    /* Thinking Effort */
    var te = profile.thinkingEffort || '';
    if (te) {
      lines.push('## Thinking Effort');
      if (te === 'minimal') {
        lines.push('Use minimal reasoning depth. Prioritize speed and efficiency over exhaustive analysis.');
      } else if (te === 'high') {
        lines.push('Apply maximum reasoning depth. Verify assumptions, explore edge cases, and show your work step-by-step.');
      } else {
        lines.push('Use standard reasoning depth for balanced analysis.');
      }
      lines.push('');
    }

    /* ## Style & Tone — keep Avoid as prose PLUS compile into CRITICAL CONSTRAINTS */
    var toneProf = (profile.promptAssembly && profile.promptAssembly.tone_profile) || null;
    var tone = toneProf && toneProf.tone;
    var avoid = toneProf && toneProf.avoid;
    if (tone || avoid) {
      lines.push('## Style & Tone');
      if (tone) lines.push('- Tone: ' + tone);
      if (avoid) lines.push('- Avoid: ' + avoid);
      lines.push('');
    }

    /* ### CRITICAL CONSTRAINTS — Avoid + Guardrail transformed with NEVER / ALWAYS prefixing */
    var profileCompliance = profile.promptAssembly && profile.promptAssembly.output_requirements && profile.promptAssembly.output_requirements.compliance;
    var criticals = window.__ca.contentMath.buildCriticalConstraints(
      avoid ? { avoid: avoid } : null,
      profileCompliance ? { compliance: profileCompliance } : null
    );

    if (criticals.length > 0) {
      lines.push('### CRITICAL CONSTRAINTS');
      for (var ci = 0; ci < criticals.length; ci++) {
        lines.push((ci + 1) + '. ' + criticals[ci]);
      }
      lines.push('');
    }

    /* ## Execution Guardrails — Socratic + Uncertainty as numbered rules */
    var guardrails = [];
    var socratic = profile.promptAssembly && profile.promptAssembly.socratic_trigger;
    if (socratic) guardrails.push(socratic);
    var uncertainty = profile.promptAssembly && profile.promptAssembly.uncertainty_protocol;
    if (uncertainty) guardrails.push(uncertainty);

    if (guardrails.length > 0) {
      lines.push('## Execution Guardrails');
      for (var gi = 0; gi < guardrails.length; gi++) {
        lines.push((gi + 1) + '. ' + guardrails[gi]);
      }
      lines.push('');
    }

    /* Grounding Mode */
    var gm = profile.groundingMode || '';
    if (gm === 'strict') {
      lines.push('## Grounding');
      lines.push('STRICT GROUNDING: Use ONLY the information explicitly provided in the current conversation context. Do not reference any external knowledge, training data, or pre-existing facts. Base every claim solely on what has been stated in this chat.');
      lines.push('');
    } else if (gm === 'web') {
      lines.push('## Grounding');
      lines.push('Before responding, perform a live web search. Prioritize real-time data. After retrieving results, ground your answer in those sources.');
      lines.push('');
    }

    /* ## Output Structure */
    var fmt = profile.promptAssembly && profile.promptAssembly.output_requirements && profile.promptAssembly.output_requirements.format;
    var verbosity = profile.outputVerbosity || (profile.promptAssembly && profile.promptAssembly.output_requirements && profile.promptAssembly.output_requirements.clarity) || '';
    var fmtChoice = profile.outputFormatChoice || '';
    if (fmt || verbosity || fmtChoice) {
      lines.push('## Output Structure');
      if (fmt) lines.push('- Format: ' + fmt);
      if (fmtChoice) {
        var fmtFlags = {
          markdown: 'Return output in valid Markdown. Use code blocks with language tags where applicable.',
          json: 'Return ONLY a valid JSON object. Do not include introductory or concluding conversational prose.',
          'code-block': 'Return output as a single code block with explicit language tag. No surrounding explanation.',
          table: 'Return output as a structured two-column table. Use Markdown table syntax. No prose before or after.'
        };
        var flag = fmtFlags[fmtChoice.toLowerCase()] || '';
        if (flag) lines.push('- System Flag: ' + flag);
      }
      if (verbosity) lines.push('- Verbosity: ' + verbosity);
      lines.push('');
    }

    lines.push('</system_instruction>');

    return lines.length > 3 ? lines.join('\n') : null;
  }

  function compileAnchorBehaviorBlock(anchor) {
    if (!anchor) return null;

    var lines = ['<system_instruction>', ''];
    var hasContent = false;

    /* ## Domain Scope */
    if (anchor.domainFocus && anchor.domainFocus.length > 0) {
      lines.push('## Domain Scope');
      lines.push('<domain_scope>' + anchor.domainFocus.join(', ') + '</domain_scope>');
      lines.push('');
      hasContent = true;
    }

    /* ## Style & Tone — keep Avoid as prose PLUS compile into CRITICAL CONSTRAINTS */
    if (anchor.toneProfile && (anchor.toneProfile.tone || anchor.toneProfile.avoid)) {
      lines.push('## Style & Tone');
      if (anchor.toneProfile.tone) lines.push('- Tone: ' + anchor.toneProfile.tone);
      if (anchor.toneProfile.avoid) lines.push('- Avoid: ' + anchor.toneProfile.avoid);
      lines.push('');
      hasContent = true;
    }

    /* ### CRITICAL CONSTRAINTS — Avoid + Guardrail with NEVER / ALWAYS prefixing */
    var criticals = window.__ca.contentMath.buildCriticalConstraints(anchor.toneProfile, anchor.outputRequirements);

    if (criticals.length > 0) {
      lines.push('### CRITICAL CONSTRAINTS');
      for (var ci = 0; ci < criticals.length; ci++) {
        lines.push((ci + 1) + '. ' + criticals[ci]);
      }
      lines.push('');
      hasContent = true;
    }

    /* ## Execution Guardrails — Socratic + Uncertainty */
    var guardrails = [];
    if (anchor.socraticTrigger) guardrails.push(anchor.socraticTrigger);
    if (anchor.uncertaintyProtocol) guardrails.push(anchor.uncertaintyProtocol);

    if (guardrails.length > 0) {
      lines.push('## Execution Guardrails');
      for (var gi = 0; gi < guardrails.length; gi++) {
        lines.push((gi + 1) + '. ' + guardrails[gi]);
      }
      lines.push('');
      hasContent = true;
    }

    /* ## Output Structure */
    var fmt = anchor.outputRequirements && anchor.outputRequirements.format;
    var clarity = anchor.outputRequirements && anchor.outputRequirements.clarity;
    var fmtChoice = anchor.outputFormatChoice || '';
    if (fmt || clarity || fmtChoice) {
      lines.push('## Output Structure');
      if (fmt) lines.push('- Format: ' + fmt);
      if (fmtChoice) {
        var fmtFlagsA = {
          markdown: 'Return output in valid Markdown. Use code blocks with language tags where applicable.',
          json: 'Return ONLY a valid JSON object. Do not include introductory or concluding conversational prose.',
          'code-block': 'Return output as a single code block with explicit language tag. No surrounding explanation.',
          table: 'Return output as a structured two-column table. Use Markdown table syntax. No prose before or after.'
        };
        var flagA = fmtFlagsA[fmtChoice.toLowerCase()] || '';
        if (flagA) lines.push('- System Flag: ' + flagA);
      }
      if (clarity) lines.push('- Verbosity: ' + clarity);
      lines.push('');
      hasContent = true;
    }

    lines.push('</system_instruction>');

    return hasContent ? lines.join('\n') : null;
  }

  function buildContextPrefix(activeAnchors, promptText) {
    var contextParts = [];
    var matchedIds = [];
    var behaviorParts = [];
    var promptLower = (promptText && promptText.length > 0) ? promptText.toLowerCase() : '';

    for (var i = 0; i < activeAnchors.length; i++) {
      var item = activeAnchors[i];
      var include = promptLower && window.__ca.contentMath.matchesTriggerKeywords(promptText, item.triggerKeywords);
      if (include) {
        contextParts.push(item.text);
        matchedIds.push(item.id);
        var behaviorBlock = compileAnchorBehaviorBlock(item);
        if (behaviorBlock) {
          behaviorParts.push(behaviorBlock);
        }
      }
    }

    var prefix = contextParts.length > 0 ? contextParts.join('. ') + '. ' : '';
    return { prefix: prefix, matchedIds: matchedIds, behaviorBlocks: behaviorParts };
  }

  function applyContextToInput(inputEl) {
    if (applyDebounceTimer) return;
    applyDebounceTimer = setTimeout(function() { applyDebounceTimer = null; }, 500);

    var activeAnchors = filterByScope(window.__ca.storage.getActive());
    var activeTemplates = window.__ca.storage.getActiveTemplates();
    var allActive = activeAnchors.concat(activeTemplates);

    var constraintBlock = getActiveConstraintsBlock();

    if (allActive.length === 0 && !constraintBlock && !window.__ca.state.profileSystemInstruction) return;

    var inputText = inputEl.textContent || '';
    if (inputText.length === 0 && !constraintBlock) return;

    conversationTurn++;
    var isReminderTurn = (conversationTurn === 1 || conversationTurn % REMINDER_INTERVAL === 0);

    var prefixResult = buildContextPrefix(allActive, inputText);
    var contextPrefix = prefixResult.prefix;
    var matchedIds = prefixResult.matchedIds;
    var anchorBehaviorBlocks = prefixResult.behaviorBlocks;

    if (contextPrefix.length > 0) {
      window.__ca.storage.decrementTurnsForIds(matchedIds);
      observerDecrementBlocked = true;
      window.__ca.events.emit('anchors:changed');
      checkCMA();
    } else {
      var manualMatchIds = [];
      for (var m = 0; m < allActive.length; m++) {
        if (allActive[m].text && inputText.indexOf(allActive[m].text) !== -1) {
          manualMatchIds.push(allActive[m].id);
        }
      }
      if (manualMatchIds.length > 0) {
        window.__ca.storage.decrementTurnsForIds(manualMatchIds);
        observerDecrementBlocked = true;
        window.__ca.events.emit('anchors:changed');
        checkCMA();
      }
    }

    // Strip matched trigger keywords from user input so they don't appear in the prompt
    var cleanedInput = inputText;
    var wordsBefore = inputText.split(/\s+/).filter(Boolean).length;
    var totalKeywordsStripped = 0;
    var stripTargetIds = (contextPrefix.length > 0 ? matchedIds : (typeof manualMatchIds !== 'undefined' ? manualMatchIds : []));

    try {
      for (var i = 0; i < stripTargetIds.length; i++) {
        var item = null;
        for (var ai = 0; ai < allActive.length; ai++) {
          if (allActive[ai].id === stripTargetIds[i]) { item = allActive[ai]; break; }
        }
        if (!item || !item.triggerKeywords || item.triggerKeywords.length === 0) continue;
        var before = cleanedInput;
        cleanedInput = window.__ca.contentMath.stripTriggerKeywords(cleanedInput, item.triggerKeywords);
        if (cleanedInput.length !== before.length) {
          totalKeywordsStripped++;
        }
      }
    } catch(e) {
      console.warn('[CA] Keyword stripping failed, falling back to original input:', e);
      cleanedInput = inputText;
    }

    var wordsAfter = cleanedInput.split(/\s+/).filter(Boolean).length;
    if (contextPrefix.length === 0 && (cleanedInput.length === 0 || (wordsBefore - wordsAfter) > totalKeywordsStripped * 2)) {
      cleanedInput = inputText;
    }

    var mode = window.__ca.storage.getInjectionMode();
    var combinedPrefix = '';

    if (mode === 'intermittent') {
      if (isReminderTurn) {
        if (conversationTurn === 1) {
          if (window.__ca.state.profileSystemInstruction) combinedPrefix += window.__ca.state.profileSystemInstruction + '\n\n';
          if (anchorBehaviorBlocks && anchorBehaviorBlocks.length > 0) combinedPrefix += anchorBehaviorBlocks.join('\n\n') + '\n\n';
          if (constraintBlock) combinedPrefix += constraintBlock + '\n';
        } else {
          var checkpoint = buildCheckpointText();
          if (checkpoint) {
            combinedPrefix += checkpoint + '\n\n';
            if (!checkpointToastShown) {
              showToast('Behavioral checkpoint active — compliance verified every ' + REMINDER_INTERVAL + ' turns');
              checkpointToastShown = true;
            }
          }
        }
      }
    } else {
      if (window.__ca.state.profileSystemInstruction) combinedPrefix += window.__ca.state.profileSystemInstruction + '\n\n';
      if (anchorBehaviorBlocks && anchorBehaviorBlocks.length > 0) combinedPrefix += anchorBehaviorBlocks.join('\n\n') + '\n\n';
      if (constraintBlock) combinedPrefix += constraintBlock + '\n';
    }

    combinedPrefix += contextPrefix;

    if (mode === 'append') {
      inputEl.textContent = cleanedInput + ' ' + combinedPrefix;
    } else {
      inputEl.textContent = combinedPrefix + cleanedInput;
    }
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    lastInputText = inputEl.textContent || '';
    if (window.__ca.dashboardMath) {
      _lastPromptTokens = window.__ca.dashboardMath.estimateTokens(lastInputText, false);
    }
  }

  function setupSelectionObserver() {
    document.addEventListener('mouseup', function(e) {
      if (e.target.closest('.ca-selection-button')) return;

      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      var text = selection.toString().trim();
      if (text.length === 0) {
        return;
      }

      var range = selection.getRangeAt(0);
      var messageId = window.__ca.shared.findMessageContext(range.commonAncestorContainer);
      var rect = range.getBoundingClientRect();
      var selectedText = selection.toString().trim();

      /* Pre-compute anchor metadata at mouseup time while the selection
         DOM is guaranteed fresh — prevents stale Range references causing
         textOffset to snap to position 0 after Gemini re-renders */
      var precomputedOpts = { messageId: messageId };
      if (window.__ca.hostAdapter) {
        var _startNode = window.__ca.hostAdapter.getNormalizedStartNode(range);
        var _startEl = (_startNode.nodeType === Node.TEXT_NODE ? _startNode.parentElement : _startNode);
        var _msgEl = _startEl.closest('user-query, model-response, ms-chat-turn, [data-test-id="conversation-turn"], [data-test-id="message"], [data-message-id], [data-e2e-id]');
        if (_msgEl) {
          var _resolved = window.__ca.hostAdapter.resolveAnchorBlock(_msgEl, range);
          var _blockEl = _resolved.blockEl;
          precomputedOpts.blockIndex = _resolved.blockIdx;
          if (_blockEl) {
            precomputedOpts.blockTextHash = window.__ca.shared.simpleHash((_blockEl.textContent || '').trim(), 16);
          }
          var _textScope = _blockEl || _msgEl;
          var _preRange = range.cloneRange();
          _preRange.selectNodeContents(_textScope);
          _preRange.setEnd(range.startContainer, range.startOffset);
          precomputedOpts.textOffset = _preRange.toString().length;
          var _sc = window.__ca.hostAdapter.findScrollContainer();
          if (_sc) {
            var _all = window.__ca.hostAdapter.getMessageElements(_sc);
            precomputedOpts.msgIndex = _all.indexOf(_msgEl);
          }
        }
      }

      removeSelectionButton();

      var btn = document.createElement('div');
      btn.className = 'ca-selection-button';

      var bookmarkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      bookmarkSvg.setAttribute('viewBox', '0 0 24 24');
      var bookmarkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      bookmarkPath.setAttribute('d', 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z');
      bookmarkSvg.appendChild(bookmarkPath);
      btn.appendChild(bookmarkSvg);

      btn.style.cssText = 'position:fixed;left:' + Math.min(rect.right + 8, window.innerWidth - 40) + 'px;top:' + (rect.top + rect.height / 2 - 16) + 'px;z-index:2147483646;background:#4285f4;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;pointer-events:auto;';

      btn.addEventListener('click', function(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        if (selectedText.length > 0) {
          var btnRect = btn.getBoundingClientRect();
          window.__ca.panel.renderTurnPopup(btnRect, function(turns, ttlMinutes, description, sourceUrl) {
            try {
              var finalSource = sourceUrl || window.location.href;
              var existing = window.__ca.storage.findByText(selectedText);
              var anchorOpts = precomputedOpts;
              var anchor = window.__ca.storage.createAnchor(selectedText, finalSource, turns, undefined, anchorOpts);
              if (_blockEl && window.__ca.minimap && window.__ca.minimap.recordAnchorBlock) {
                window.__ca.minimap.recordAnchorBlock(_blockEl, anchor.id, precomputedOpts.blockTextHash);
              }
              if (existing.length > 0) {
                showToast('Anchor saved (' + turns + ' turns) — duplicate text exists', 'warning');
              } else {
                showToast('Anchor saved (' + turns + ' turns' + (ttlMinutes ? ', ' + window.__ca.shared.formatTTL(ttlMinutes) + ' TTL' : '') + ')', 'success');
              }
              if (ttlMinutes !== null && ttlMinutes !== undefined) {
                window.__ca.storage.setTTL(anchor.id, ttlMinutes);
              }
              if (description) {
                window.__ca.storage.updateAnchor(anchor.id, { description: description });
              }
              window.__ca.events.emit('anchors:changed');
            } catch(e) {
              console.error('[CA] Error creating anchor:', e);
              removeSelectionButton();
              showToast('Failed to create anchor. Please try again.', 'error');
              return;
            }
            btn.removeChild(btn.firstChild);
            var checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            checkSvg.setAttribute('viewBox', '0 0 24 24');
            checkSvg.setAttribute('fill', 'white');
            var checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            checkPath.setAttribute('d', 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z');
            checkSvg.appendChild(checkPath);
            btn.appendChild(checkSvg);
            btn.style.background = '#81c995';
            // Toast shown above in try block — no duplicate needed here
            setTimeout(function() {
              removeSelectionButton();
            }, 1000);
          });
        }
      });
 
      document.body.appendChild(btn);
      selectionButton = btn;

      // SHADOW DOM EXCEPTION: Auto-dismiss the floating button after 30s
      // (safety net in case the mousedown dismiss handler doesn't fire,
      // e.g. the button is outside viewport when user clicks elsewhere)
      setTimeout(function() {
        removeSelectionButton();
      }, 30000);
    });

    var selectionDismissHandler = function(e) {
      if (selectionButton && !selectionButton.contains(e.target)) {
        removeSelectionButton();
      }
    };
    document.addEventListener('mousedown', selectionDismissHandler);
  }

  function removeSelectionButton() {
    if (selectionButton && selectionButton.parentNode) {
      selectionButton.parentNode.removeChild(selectionButton);
      selectionButton = null;
    }
  }

  function setupPromptInterceptor() {
    var setupAttempts = 0;
    var maxSetupAttempts = 40;

    function trySetup() {
      var inputEl = resolveSelector(activeSelectors.input);

      if (!inputEl) {
        setupAttempts++;
        if (setupAttempts >= maxSetupAttempts) {
          showToast('Could not find chat input after ' + (maxSetupAttempts / 2) + ' seconds. Try reloading the page.', 'warning');
          return;
        }
        setTimeout(trySetup, 500);
        return;
      }

      if (inputSetup) return;
      inputSetup = true;

      document.addEventListener('mousedown', function(e) {
        if (e.button === 0) {
          for (var si = 0; si < activeSelectors.sendButton.length; si++) {
            if (e.target.closest(activeSelectors.sendButton[si])) {
              var currentInput = resolveSelector(activeSelectors.input);
              if (currentInput) applyContextToInput(currentInput);
              break;
            }
          }
        }
      }, true);

      inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) applyContextToInput(inputEl);
      });
    }

    trySetup();
  }

  function setupConstraintInterceptor() {
    window.__ca.events.on('constraints:changed', function() {
      var activeConstraints = window.__ca.storage.getActiveConstraints();
      var count = activeConstraints ? activeConstraints.length : 0;
      showToast('Constraints updated: ' + count + ' active', 'success');
      if (window.__ca.panel && window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
      window.__ca.events.emit('anchors:changed');
    });
    window.__ca.events.on('anchors:changed', function() {
      if (window.__ca.panel && window.__ca.panel.updatePanelStatusBar) window.__ca.panel.updatePanelStatusBar();
    });
  }

  function setupTurnDecrementObserver() {
    if (turnDecrementObserver) {
      turnDecrementObserver.disconnect();
      turnDecrementObserver = null;
    }
    if (chatHistoryRetryTimer) {
      clearTimeout(chatHistoryRetryTimer);
      chatHistoryRetryTimer = null;
    }
    var chatHistory = resolveSelector(activeSelectors.chatHistory);
    if (!chatHistory) {
      var inputEl = resolveSelector(activeSelectors.input);
      if (inputEl) {
        var parent = inputEl.parentElement;
        while (parent && parent !== document.body) {
          if (parent.getAttribute('role') === 'feed' ||
              parent.getAttribute('role') === 'log' ||
              parent.querySelector('[data-role="user"]') ||
              parent.querySelector('[data-message-role="user"]') ||
              parent.querySelector('[data-e2e-id]')) {
            chatHistory = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }
      if (!chatHistory && inputEl) {
        var scrollParent = inputEl.parentElement;
        while (scrollParent && scrollParent !== document.body) {
          var cs = window.getComputedStyle(scrollParent);
          if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
              cs.overflow === 'auto' || cs.overflow === 'scroll') {
            chatHistory = scrollParent;
            break;
          }
          scrollParent = scrollParent.parentElement;
        }
      }
      if (!chatHistory) {
        if (chatHistoryRetryCount < MAX_CHAT_RETRIES) {
          chatHistoryRetryCount++;
          chatHistoryRetryTimer = setTimeout(setupTurnDecrementObserver, 2000);
          return;
        }
        console.warn('[CA] Turn decrement observer: no chat history container found after ' + MAX_CHAT_RETRIES + ' attempts — falling back to document.body — turn counting may degrade on large pages');
        chatHistory = document.body;
      }
    } else {
      chatHistoryRetryCount = 0;
      resetCMA();
    }

    var processedMessages = new Set();

    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
              var msgId = node.querySelector && resolveNodeSelector(node, activeMsgDetection.msgIdSelectors);
              if (msgId && !processedMessages.has(msgId)) {
                if (processedMessages.size > 1000) processedMessages.clear();
                processedMessages.add(msgId);
                var userMsg = node.querySelector && resolveNodeSelector(node, activeMsgDetection.userIndicators);
                var textMatch = false;
                for (var pi = 0; pi < activeMsgDetection.textPatterns.length; pi++) {
                  if (node.textContent.indexOf(activeMsgDetection.textPatterns[pi]) !== -1) {
                    textMatch = true;
                    break;
                  }
                }
                if (userMsg || textMatch) {
                  if (observerDecrementBlocked) {
                    observerDecrementBlocked = false;
                  } else if (lastInputText) {
                    var obsActive = filterByScope(window.__ca.storage.getActive());
                    var obsActiveTpl = window.__ca.storage.getActiveTemplates();
                    var obsAllActive = obsActive.concat(obsActiveTpl);
                    var obsResult = buildContextPrefix(obsAllActive, lastInputText);
                    var obsIds = obsResult.matchedIds;
                    if (obsResult.prefix.length > 0) {
                      window.__ca.storage.decrementTurnsForIds(obsIds);
                      window.__ca.events.emit('anchors:changed');
                      checkCMA();
                    } else {
                      var obsManualIds = [];
                      for (var om = 0; om < obsAllActive.length; om++) {
                        if (obsAllActive[om].text && lastInputText.indexOf(obsAllActive[om].text) !== -1) {
                          obsManualIds.push(obsAllActive[om].id);
                        }
                      }
                      if (obsManualIds.length > 0) {
                        window.__ca.storage.decrementTurnsForIds(obsManualIds);
                        window.__ca.events.emit('anchors:changed');
                        checkCMA();
                      }
                    }
                  }
                  /* Response harvest for analytics */
                  if (window.__ca.dashboardMath && node.querySelector) {
                    var respEl = resolveNodeSelector(node, ['model-response']);
                    if (respEl) {
                      var result = _computeOutputTokens(respEl);
                      _lastResponseText = result.responseText;
                      _pushTurnToAnalytics(_lastPromptTokens, result.totalTokens, lastInputText, result.responseText);
                      _lastPromptTokens = 0;
                      _lastResponseText = '';
                      _pendingOutputUpdates.push({
                        respEl: respEl,
                        turnNumber: window.__ca.state.analytics.turns.length
                      });
                      if (!_flushScheduled) {
                        _flushScheduled = true;
                        requestAnimationFrame(_flushPendingUpdates);
                      }
                    }
                  }
                }
              }
              /* Response harvest for analytics — model-response node (flat sibling DOM) */
              if (window.__ca.dashboardMath && node.matches && node.matches('model-response') && !_processedModelResponses.has(node)) {
                _processedModelResponses.add(node);
                var respEl = node;
                var result = _computeOutputTokens(respEl);
                _pushTurnToAnalytics(_lastPromptTokens, result.totalTokens, lastInputText, result.responseText);
                _lastPromptTokens = 0;
                _lastResponseText = '';
                _pendingOutputUpdates.push({
                  respEl: respEl,
                  turnNumber: window.__ca.state.analytics.turns.length
                });
                if (!_flushScheduled) {
                  _flushScheduled = true;
                  requestAnimationFrame(_flushPendingUpdates);
                }
              }
            }
          }
        }
      }
    });

    observer.observe(chatHistory, {
      childList: true,
      subtree: true
    });

    turnDecrementObserver = observer;
  }

  function setupTriggerZoneHover() {
    var trigger = window.__ca.shared.$one('.ca-trigger-zone');
    var panel = window.__ca.shared.$id('ca-panel');
    if (!trigger || !panel) return;

    var showTimeout = null;
    var hideTimeout = null;

    trigger.addEventListener('mouseenter', function() {
      clearTimeout(hideTimeout);
      showTimeout = setTimeout(function() {
        panel.classList.add('open');
        focusSearchInput();
      }, 100);
    });

    trigger.addEventListener('mouseleave', function() {
      clearTimeout(showTimeout);
      if (panel.classList.contains('locked') || panel.classList.contains('ca-dragging')) return;
      hideTimeout = setTimeout(function() {
        panel.classList.remove('open');
      }, 300);
    });

    panel.addEventListener('mouseleave', function() {
      if (panel.classList.contains('locked') || panel.classList.contains('ca-dragging')) return;
      hideTimeout = setTimeout(function() {
        panel.classList.remove('open');
      }, 300);
    });

    panel.addEventListener('mouseenter', function() {
      clearTimeout(hideTimeout);
    });
  }

  function focusSearchInput() {
    setTimeout(function() {
      var panel = window.__ca.shared && window.__ca.shared.$id('ca-panel');
      if (!panel || !panel.classList.contains('open')) return;
      var input = panel.querySelector('.ca-search-input');
      if (input) input.focus();
    }, 50);
  }

  function setupKeyboardShortcuts() {
    function isCAFocused() {
      return window.__ca.HOST && window.__ca.HOST.contains(document.activeElement);
    }
    document.addEventListener('keydown', function(e) {
      var panel = window.__ca.shared.$id('ca-panel');

      var shadowActive = window.__ca.ROOT && window.__ca.ROOT.activeElement;
      var isCAInput = shadowActive
        && (shadowActive.tagName === 'INPUT' || shadowActive.tagName === 'TEXTAREA');

      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        var activeEl = document.activeElement;
        var isInput = isCAInput || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable));
        if (!isInput && !isCAFocused()) {
          e.preventDefault();
          var searchInput = window.__ca.shared.$one('.ca-search-input');
          if (searchInput) searchInput.focus();
        }
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        var acEl = document.activeElement;
        var isInp = isCAInput || (acEl && (acEl.tagName === 'INPUT' || acEl.tagName === 'TEXTAREA' || acEl.isContentEditable));
        if (!isInp && !isCAFocused()) {
          e.preventDefault();
          window.__ca.panel.openHelpGuide();
        }
      }

      if (e.key >= '1' && e.key <= '4' && e.altKey && !e.ctrlKey && !e.metaKey) {
        var acEl2 = document.activeElement;
        var isInp2 = isCAInput || (acEl2 && (acEl2.tagName === 'INPUT' || acEl2.tagName === 'TEXTAREA' || acEl2.isContentEditable));
        if (!isInp2 && !isCAFocused() && window.__ca.panel.switchTab) {
          e.preventDefault();
          var tabs = ['anchors', 'templates', 'bundles', 'constraints'];
          window.__ca.panel.switchTab(tabs[parseInt(e.key) - 1]);
        }
      }

      if (e.key === 'e' && e.altKey && !e.ctrlKey && !e.metaKey) {
        var acEl3 = document.activeElement;
        var isInp3 = isCAInput || (acEl3 && (acEl3.tagName === 'INPUT' || acEl3.tagName === 'TEXTAREA' || acEl3.isContentEditable));
        if (!isInp3 && !isCAFocused() && window.__ca.panel && window.__ca.panel.renderBehaviorEditor) {
          e.preventDefault();
          window.__ca.panel.renderBehaviorEditor();
        }
      }

      if (e.key === 'm' && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (window.__ca.minimap && window.__ca.minimap.toggle) window.__ca.minimap.toggle();
      }

      if ((e.key === 'd' || e.key === 'D') && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        var acElDash = document.activeElement;
        var isInpDash = isCAInput || (acElDash && (acElDash.tagName === 'INPUT' || acElDash.tagName === 'TEXTAREA' || acElDash.isContentEditable));
        if (!isInpDash && !isCAFocused() && window.__ca.dashboard && window.__ca.dashboard.toggle) {
          e.preventDefault();
          window.__ca.dashboard.toggle();
        }
      }

      if (e.key === 'Escape') {
        var hasOverlay = window.__ca.shared.$id('ca-editor-overlay') ||
                         window.__ca.shared.$id('ca-behavior-editor-overlay') ||
                         window.__ca.shared.$id('ca-confirm-overlay') ||
                         window.__ca.shared.$id('ca-bulk-dialog-overlay') ||
                         window.__ca.shared.$id('ca-cmd-dropdown') ||
                         window.__ca.shared.$id('ca-dashboard-overlay');
        if (!hasOverlay && panel) panel.classList.remove('open');
      }
    });

    chrome.runtime.onMessage.addListener(function(msg) {
      if (!msg || !msg.command) return;
      var panel = window.__ca.shared.$id('ca-panel');
      var selText = msg.text || '';

      if (msg.command === 'create-anchor') {
        navigator.clipboard.readText().then(function(text) {
          if (text && text.trim()) {
            showClipboardConfirmToast(text.trim());
          }
        }).catch(function() {
          showToast('Clipboard access denied', 'error');
        });
      } else if (msg.command === 'open-timeline') {
        if (window.__ca.timeline && window.__ca.timeline.renderTimelineOverlay) window.__ca.timeline.renderTimelineOverlay();
      } else if (msg.command === 'toggle-panel') {
        if (panel) {
          var opening = !panel.classList.contains('open');
          panel.classList.toggle('open');
          if (opening) focusSearchInput();
        }
      } else if (msg.command === 'toggle-bulk') {
        window.__ca.panel && window.__ca.panel.toggleBulk && window.__ca.panel.toggleBulk();
      } else if (msg.command === 'create-anchor-from-selection') {
        if (!selText || selText.length === 0) return;
        var rect = { left: (window.innerWidth - 200) / 2, bottom: 300, top: 200 };
        var messageId = null;
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          messageId = window.__ca.shared.findMessageContext(sel.getRangeAt(0).commonAncestorContainer);
        }
        var blockIdx = null;
        var blockTextHash = null;
        var textOffset = null;
        var msgIndex = null;
        if (sel && sel.rangeCount > 0 && window.__ca.hostAdapter) {
          var ctxRange = sel.getRangeAt(0);
          var _startNode = window.__ca.hostAdapter.getNormalizedStartNode(ctxRange);
          var _startEl = (_startNode.nodeType === Node.TEXT_NODE ? _startNode.parentElement : _startNode);
          var msgEl = _startEl.closest('user-query, model-response, ms-chat-turn, [data-test-id="conversation-turn"], [data-test-id="message"], [data-message-id], [data-e2e-id]');
          if (msgEl) {
            var _resolved = window.__ca.hostAdapter.resolveAnchorBlock(msgEl, ctxRange);
            var blockEl = _resolved.blockEl;
            blockIdx = _resolved.blockIdx;
            if (blockEl) {
              blockTextHash = window.__ca.shared.simpleHash((blockEl.textContent || '').trim(), 16);
            }
            var _textScope = blockEl || msgEl;
            var preRange = ctxRange.cloneRange();
            preRange.selectNodeContents(_textScope);
            preRange.setEnd(ctxRange.startContainer, ctxRange.startOffset);
            textOffset = preRange.toString().length;
            var _sc = window.__ca.hostAdapter.findScrollContainer();
            if (_sc) {
              var _all = window.__ca.hostAdapter.getMessageElements(_sc);
              msgIndex = _all.indexOf(msgEl);
            }
          }
        }
        window.__ca.panel.renderTurnPopup(rect, function(turns, ttlMinutes, description, sourceUrl) {
          try {
            var finalSource = sourceUrl || window.location.href;
            var existing = window.__ca.storage.findByText(selText);
            var anchor = window.__ca.storage.createAnchor(selText, finalSource, turns, undefined, { messageId: messageId, msgIndex: msgIndex, blockIndex: blockIdx, blockTextHash: blockTextHash, textOffset: textOffset });
            if (ttlMinutes !== null && ttlMinutes !== undefined) {
              window.__ca.storage.setTTL(anchor.id, ttlMinutes);
            }
            if (description) {
              window.__ca.storage.updateAnchor(anchor.id, { description: description });
            }
            window.__ca.events.emit('anchors:changed');
            if (existing.length > 0) {
              showToast('Anchor saved — duplicate text exists', 'warning');
            } else {
              showToast('Anchor saved', 'success');
            }
          } catch(e) {
            console.error('[CA] Error creating anchor:', e);
          }
        });
      } else if (msg.command === 'check-ttl') {
        window.__ca.storage.checkExpiredTTLs();
        window.__ca.storage.checkExpiredTemplateTTLs();
        window.__ca.events.emit('anchors:changed');
      }
    });
  }

  function injectTextToPrompt(text) {
    var inputEl = resolveSelector(activeSelectors.input);
    if (!inputEl) {
      showToast('Prompt input not found', 'error');
      return;
    }
    var inputText = inputEl.textContent || '';
    var mode = window.__ca.storage.getInjectionMode();
    if (mode === 'append') {
      inputEl.textContent = inputText + ' ' + text;
    } else {
      inputEl.textContent = text + ' ' + inputText;
    }
    inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    lastInputText = inputEl.textContent;
    inputEl.focus();
    showToast('Text injected', 'success');
  }

  function injectAnchorToPrompt(anchor) {
    if (!anchor || !anchor.text) return;
    if (!filterByScope([anchor]).length) {
      showToast('Anchor not available on this page', 'error');
      return;
    }
    injectTextToPrompt(anchor.text);
  }

  function initSlashCommands() {
    if (slashCommandsInitialized) return;
    var inputEl = resolveSelector(activeSelectors.input);
    if (!inputEl) {
      setTimeout(initSlashCommands, 500);
      return;
    }
    slashCommandsInitialized = true;
    cmdInputEl = inputEl;

inputEl.addEventListener('input', function() {
  var currentText = inputEl.textContent || '';
  // Only process if we might be typing a slash command (/a or /p) to reduce interference with ProseMirror
  if (currentText.endsWith('/') || currentText.match(/\/[ap]\s*$/)) {
    lastInputText = currentText;
    clearTimeout(slashDebounceTimer);
    slashDebounceTimer = setTimeout(processSlashInput, 50);
  }
});
  }

  function processSlashInput() {
    if (!cmdInputEl) return;
    var beforeCursor = getTextBeforeCursor(cmdInputEl);
    var cmdMatch = beforeCursor.match(/\/([ap])\s+(\S*)\s*$/);
    if (!cmdMatch) {
      cmdSavedBeforeText = null;
      dismissCmdDropdown();
      return;
    }

    cmdSavedBeforeText = beforeCursor;

    cmdCommandType = cmdMatch[1];
    var searchTerm = cmdMatch[2];

    if (!searchTerm) {
      var allAnchors = filterByScope(window.__ca.storage.getSorted('most-used'));
      allAnchors.sort(function(a, b) {
        var tagA = (a.tags && a.tags[0]) || '\uffff';
        var tagB = (b.tags && b.tags[0]) || '\uffff';
        return tagA.localeCompare(tagB);
      });
      if (allAnchors.length > 0) {
        renderCmdDropdown(allAnchors.slice(0, 10), cmdCommandType);
      } else {
        renderCmdDropdownEmpty();
      }
      return;
    }

    var matches = getCmdMatches(searchTerm);
    if (matches.length > 0) {
      renderCmdDropdown(matches, cmdCommandType);
    } else {
      renderCmdDropdownEmpty();
    }
  }

  function getCmdMatches(term) {
    var anchors = filterByScope(window.__ca.storage.getSorted('most-used'));
    return window.__ca.contentMath.getCmdMatches(anchors, term);
  }

  function renderCmdDropdown(matches, commandType) {
    dismissCmdDropdown();

    var rect = getCursorRect();
    if (!rect) return;
    cmdCursorRect = rect;

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    var dropdown = $create('div', { id: 'ca-cmd-dropdown', className: 'ca-cmd-dropdown' });
    var header = $create('div', { className: 'ca-cmd-header' });
    var headerTitle = $create('span', { textContent: '/' + commandType + '\u2003\u2014\u2003' + (commandType === 'a' ? 'after cursor' : 'before prompt') });
    header.appendChild(headerTitle);
    dropdown.appendChild(header);

    var list = $create('div', { className: 'ca-cmd-list' });

    cmdLastMatches = matches;
    cmdLastCommandType = commandType;

    var tagCounts = {};
    for (var j = 0; j < matches.length; j++) {
      var key = (matches[j].tags && matches[j].tags[0]) || 'Untagged';
      tagCounts[key] = (tagCounts[key] || 0) + 1;
    }

    var currentTag = undefined;
    for (var i = 0; i < matches.length; i++) {
      var anchor = matches[i];

      /* Group header by first tag (collapsible) */
      var groupTag = anchor.tags && anchor.tags[0] ? anchor.tags[0] : '';
      if (groupTag !== currentTag) {
        currentTag = groupTag;
        var label = groupTag || 'Untagged';
        var isCollapsed = cmdCollapsedGroups[label] === true;
        list.appendChild(buildCmdGroupHeader(label, isCollapsed, tagCounts[label]));
      }

      /* Skip items in collapsed groups */
      if (cmdCollapsedGroups[currentTag]) continue;

      var isExpired = anchor.turnsRemaining === 0;
      var isExpiring = !isExpired && anchor.turnsRemaining <= 3;
      var itemClass = 'ca-cmd-item';
      if (anchor.global) itemClass += ' global';
      if (i === 0) itemClass += ' selected';
      if (isExpired) itemClass += ' expired';

      var item = $create('div', {
        className: itemClass,
        'data-action': 'cmd-select',
        'data-id': anchor.id
      });

      var descText = anchor.description || anchor.text;
      var textSpan = $create('span', {
        className: 'ca-cmd-text',
        textContent: esc(descText)
      });
      item.appendChild(textSpan);

      var turnsClass = 'ca-anchor-turns';
      if (isExpiring) turnsClass += ' expiring';
      if (isExpired) turnsClass += ' expired';
      var turnsSpan = $create('span', {
        className: turnsClass,
        textContent: esc(anchor.turnsRemaining) + '/' + esc(anchor.turnsTotal)
      });
      item.appendChild(turnsSpan);

      list.appendChild(item);
    }

    /* Ensure first visible item has selected class if no item claimed it */
    var firstItem = list.querySelector('.ca-cmd-item');
    if (firstItem && !firstItem.classList.contains('selected')) {
      firstItem.classList.add('selected');
    }

    dropdown.appendChild(list);

    var footer = $create('div', { className: 'ca-cmd-footer', textContent: '\u2191\u2193 navigate  \u21b5 select  esc dismiss' });
    dropdown.appendChild(footer);

    cmdDropdown = dropdown;
    window.__ca.shared.$append(dropdown);

    dropdown.addEventListener('mousedown', function(e) {
      if (e.target.closest('.ca-anchor-turns')) {
        e.stopPropagation();
      }
    });

    var dropdownHeight = dropdown.getBoundingClientRect().height;
    var top = rect.bottom + 4;
    if (top + dropdownHeight > window.innerHeight - 8) {
      top = rect.top - dropdownHeight - 4;
    }
    dropdown.style.left = Math.max(8, rect.left) + 'px';
    dropdown.style.top = Math.max(8, top) + 'px';

    setupCmdDropdownEvents(dropdown, list, commandType);
  }

  function refreshCmdDropdown(matches) {
    if (!cmdDropdown) return;
    var list = cmdDropdown.querySelector('.ca-cmd-list');
    if (!list) return;

    var $create = window.__ca.shared.$create;
    var esc = window.__ca.shared.esc;

    list.textContent = '';

    var tagCounts = {};
    for (var j = 0; j < matches.length; j++) {
      var key = (matches[j].tags && matches[j].tags[0]) || 'Untagged';
      tagCounts[key] = (tagCounts[key] || 0) + 1;
    }

    var currentTag = undefined;
    for (var i = 0; i < matches.length; i++) {
      var anchor = matches[i];

      var groupTag = anchor.tags && anchor.tags[0] ? anchor.tags[0] : '';
      if (groupTag !== currentTag) {
        currentTag = groupTag;
        var label = groupTag || 'Untagged';
        var isCollapsed = cmdCollapsedGroups[label] === true;
        list.appendChild(buildCmdGroupHeader(label, isCollapsed, tagCounts[label]));
      }

      if (cmdCollapsedGroups[currentTag]) continue;

      var isExpired = anchor.turnsRemaining === 0;
      var isExpiring = !isExpired && anchor.turnsRemaining <= 3;
      var itemClass = 'ca-cmd-item';
      if (anchor.global) itemClass += ' global';
      if (i === 0) itemClass += ' selected';
      if (isExpired) itemClass += ' expired';

      var item = $create('div', {
        className: itemClass,
        'data-action': 'cmd-select',
        'data-id': anchor.id
      });

      var descText = anchor.description || anchor.text;
      var textSpan = $create('span', {
        className: 'ca-cmd-text',
        textContent: esc(descText)
      });
      item.appendChild(textSpan);

      var turnsClass = 'ca-anchor-turns';
      if (isExpiring) turnsClass += ' expiring';
      if (isExpired) turnsClass += ' expired';
      var turnsSpan = $create('span', {
        className: turnsClass,
        textContent: esc(anchor.turnsRemaining) + '/' + esc(anchor.turnsTotal)
      });
      item.appendChild(turnsSpan);

      list.appendChild(item);
    }

    var firstItem = list.querySelector('.ca-cmd-item');
    if (firstItem && !firstItem.classList.contains('selected')) {
      firstItem.classList.add('selected');
    }

    cmdDropdown._items = list.querySelectorAll('.ca-cmd-item');
    cmdDropdown._selIdx = 0;

    /* Reposition after content change (e.g., expanding a collapsed group) */
    if (cmdCursorRect) {
      var newTop = cmdCursorRect.bottom + 4;
      if (newTop + cmdDropdown.getBoundingClientRect().height > window.innerHeight - 8) {
        newTop = cmdCursorRect.top - cmdDropdown.getBoundingClientRect().height - 4;
      }
      cmdDropdown.style.top = Math.max(8, newTop) + 'px';
      cmdDropdown.style.left = Math.max(8, cmdCursorRect.left) + 'px';
    }
  }

  function buildCmdGroupHeader(label, isCollapsed, count) {
    return window.__ca.shared.buildTagGroupHeader(label, isCollapsed, count);
  }

  function renderCmdDropdownEmpty() {
    dismissCmdDropdown();

    var rect = getCursorRect();
    if (!rect) return;
    cmdCursorRect = rect;

    var $create = window.__ca.shared.$create;

    var dropdown = $create('div', { id: 'ca-cmd-dropdown', className: 'ca-cmd-dropdown' });

    var header = $create('div', { className: 'ca-cmd-header' });
    var headerTitle = $create('span', { textContent: '/' + cmdCommandType + '\u2003\u2014\u2003' + (cmdCommandType === 'a' ? 'after cursor' : 'before prompt') });
    header.appendChild(headerTitle);
    dropdown.appendChild(header);

    var empty = $create('div', { className: 'ca-cmd-empty', textContent: 'No anchors matching your search' });
    dropdown.appendChild(empty);

    cmdDropdown = dropdown;
    window.__ca.shared.$append(dropdown);

    dropdown.addEventListener('mousedown', function(e) {
      if (e.target.closest('.ca-anchor-turns')) {
        e.stopPropagation();
      }
    });

    var dropdownHeight = dropdown.getBoundingClientRect().height;
    var top = rect.bottom + 4;
    if (top + dropdownHeight > window.innerHeight - 8) {
      top = rect.top - dropdownHeight - 4;
    }
    dropdown.style.left = Math.max(8, rect.left) + 'px';
    dropdown.style.top = Math.max(8, top) + 'px';

    setupCmdDropdownDismiss(dropdown);
  }

  function getCursorRect() {
    if (!cmdInputEl) return null;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var range = sel.getRangeAt(0).cloneRange();
    if (!cmdInputEl.contains(range.commonAncestorContainer)) return null;
    range.collapse(true);
    var rect = range.getBoundingClientRect();
    return rect;
  }

  function setupCmdDropdownEvents(dropdown, list, commandType) {
    dropdown._items = list.querySelectorAll('.ca-cmd-item');
    dropdown._selIdx = 0;

    function updateSelection() {
      var items = dropdown._items;
      var sel = dropdown._selIdx;
      for (var i = 0; i < items.length; i++) {
        if (i === sel) {
          if (items[i].className.indexOf(' selected') === -1) {
            items[i].className += ' selected';
          }
        } else {
          items[i].className = items[i].className.replace(' selected', '');
        }
      }
    }

var keyHandler = function(e) {
  // Only prevent default if slash command dropdown is demonstrably open and visible
  var isDropdownOpen = cmdDropdown && 
                      cmdDropdown.parentNode && 
                      cmdDropdown.style.display !== 'none' &&
                      cmdDropdown.getBoundingClientRect().height > 0;
   
  if (e.key === 'ArrowDown' && isDropdownOpen) {
    e.preventDefault();
    dropdown._selIdx = (dropdown._selIdx + 1) % dropdown._items.length;
    updateSelection();
  } else if (e.key === 'ArrowUp' && isDropdownOpen) {
    e.preventDefault();
    dropdown._selIdx = (dropdown._selIdx - 1 + dropdown._items.length) % dropdown._items.length;
    updateSelection();
  } else if (e.key === 'Enter' && isDropdownOpen) {
    e.stopPropagation();
    e.preventDefault();
    var selItem = dropdown._items[dropdown._selIdx];
    if (selItem && selItem.dataset.id) {
      commitSlashCommand(selItem.dataset.id, commandType, cmdInputEl);
    }
  } else if (e.key === 'Escape' && isDropdownOpen) {
    e.preventDefault();
    e.stopPropagation();
    dismissCmdDropdown();
  }
  // Allow normal handling for all other cases (including when dropdown is closed)
};
    document.addEventListener('keydown', keyHandler, true);
    dropdown._keyHandler = keyHandler;

    dropdown.addEventListener('click', function(e) {
      e.stopPropagation();

      var toggleTarget = e.target.closest('[data-action="tag-popup-toggle-group"]');
      if (toggleTarget && toggleTarget.dataset.group) {
        cmdCollapsedGroups[toggleTarget.dataset.group] = !cmdCollapsedGroups[toggleTarget.dataset.group];
        refreshCmdDropdown(cmdLastMatches);
        return;
      }

      var target = e.target.closest('[data-action="cmd-select"]');
      if (target && target.dataset.id) {
        commitSlashCommand(target.dataset.id, commandType, cmdInputEl);
      }
    });

    setupCmdDropdownDismiss(dropdown);
  }

  function setupCmdDropdownDismiss(dropdown) {
    var rootHandler = function(e) {
      if (!dropdown.contains(e.target)) {
        dismissCmdDropdown();
      }
    };
    window.__ca.ROOT.addEventListener('mousedown', rootHandler);
    dropdown._rootHandler = rootHandler;

    var docHandler = function(e) {
      if (e.target === window.__ca.HOST) return;
      if (dropdown.contains(e.target)) return;
      if (cmdInputEl && (e.target === cmdInputEl || cmdInputEl.contains(e.target))) return;
      dismissCmdDropdown();
    };
    document.addEventListener('mousedown', docHandler);
    dropdown._docHandler = docHandler;
  }

  function commitSlashCommand(anchorId, commandType, inputEl) {
    var anchor = window.__ca.storage.getAll().filter(function(a) { return a.id === anchorId; })[0];
    if (!anchor || !anchor.text) return;
    if (!filterByScope([anchor]).length) {
      showToast('Anchor not available on this page', 'error');
      return;
    }

    var text = inputEl.textContent || '';
    var beforeCursor = cmdSavedBeforeText || getTextBeforeCursor(inputEl);
    var cleanedBefore = beforeCursor.replace(/\s*\/[ap]\s+\S*\s*$/, '');
    var afterCursor = text.substring(beforeCursor.length);
    var inlineSlash = window.__ca.storage.getSetting('inlineSlash');
    var sep = inlineSlash ? ' ' : '\n\n';

    if (commandType === 'a') {
      var parts = [];
      if (cleanedBefore) parts.push(cleanedBefore);
      parts.push(anchor.text);
      if (afterCursor) parts.push(afterCursor);
      inputEl.textContent = parts.join(sep);
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    } else if (inlineSlash) {
      inputEl.textContent = anchor.text + sep + cleanedBefore + (afterCursor ? sep + afterCursor : '');
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    } else {
      var pb = cleanedBefore.lastIndexOf('\n\n');
      if (pb !== -1) {
        var beforeBlock = cleanedBefore.substring(0, pb);
        var afterBlock = cleanedBefore.substring(pb + 2);
        inputEl.textContent = beforeBlock + '\n\n' + anchor.text + '\n\n' + afterBlock + (afterCursor ? '\n\n' + afterCursor : '');
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      } else {
        inputEl.textContent = anchor.text + '\n\n' + cleanedBefore + (afterCursor ? '\n\n' + afterCursor : '');
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
    }

    inputEl.focus();
    var range = document.createRange();
    range.selectNodeContents(inputEl);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    lastInputText = inputEl.textContent || '';
    dismissCmdDropdown();
  }

  function getTextBeforeCursor(inputEl) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || !inputEl) return '';
    var range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    if (!inputEl.contains(range.commonAncestorContainer)) return '';
    var fullRange = document.createRange();
    fullRange.selectNodeContents(inputEl);
    fullRange.setEnd(range.endContainer, range.endOffset);
    return fullRange.toString();
  }

  function dismissCmdDropdown() {
    if (cmdDropdown && cmdDropdown.parentNode) {
      if (cmdDropdown._keyHandler) {
        document.removeEventListener('keydown', cmdDropdown._keyHandler, true);
      }
      if (cmdDropdown._rootHandler) {
        window.__ca.ROOT.removeEventListener('mousedown', cmdDropdown._rootHandler);
      }
      if (cmdDropdown._docHandler) {
        document.removeEventListener('mousedown', cmdDropdown._docHandler);
      }
      cmdDropdown.parentNode.removeChild(cmdDropdown);
      cmdDropdown = null;
    }
  }

  function checkPendingSessionImports() {
    var currentId = window.__ca.shared.extractGeminiSessionId();
    if (!currentId) return;
    window.__ca.storage.consumePendingImport(function(payload) {
      if (!payload || !payload.metadata || !payload.metadata.sessionId) return;
      if (payload.metadata.sessionId !== currentId) return;

      var idMap = {};
      var importedA = 0, skippedA = 0, duplicateA = 0;
      var importedT = 0, skippedT = 0;
      var importedB = 0, skippedB = 0;
      var importedC = 0, skippedC = 0;

      if (Array.isArray(payload.anchors)) {
        for (var i = 0; i < payload.anchors.length; i++) {
          var a = payload.anchors[i];
          if (!a || typeof a.text !== 'string') { skippedA++; continue; }
          var existing = window.__ca.storage.getAll().filter(function(x) { return x.text === a.text; });
          if (existing.length > 0) { duplicateA++; continue; }
          var newA = window.__ca.storage.createAnchor(a.text, a.sourceUrl, a.turnsTotal, a.global, {
            messageId: a.messageId || null,
            blockIndex: a.blockIndex != null ? a.blockIndex : null,
            msgIndex: a.msgIndex != null ? a.msgIndex : null,
            blockTextHash: a.blockTextHash || null,
            textOffset: a.textOffset != null ? a.textOffset : null
          });
          if (!newA) { skippedA++; continue; }
          idMap[a.id] = newA.id;
          importedA++;
          var updates = {};
          if (typeof a.turnsRemaining === 'number') updates.turnsRemaining = a.turnsRemaining;
          if (typeof a.active === 'boolean') updates.active = a.active;
          if (a.description) updates.description = a.description;
          if (Array.isArray(a.usageHistory)) updates.usageHistory = a.usageHistory;
          if (typeof a.usageCount === 'number') updates.usageCount = a.usageCount;
          if (typeof a.lastUsed === 'number') updates.lastUsed = a.lastUsed;
          if (typeof a.ttlMinutes === 'number') updates.ttlMinutes = a.ttlMinutes;
          if (typeof a.ttlExpiresAt === 'number') updates.ttlExpiresAt = a.ttlExpiresAt;
          if (typeof a.originalTurns === 'number') updates.originalTurns = a.originalTurns;
          if (typeof a.totalTurnsConsumed === 'number') updates.totalTurnsConsumed = a.totalTurnsConsumed;
          if (a.toneProfile && typeof a.toneProfile === 'object') updates.toneProfile = a.toneProfile;
          if (Array.isArray(a.domainFocus) && a.domainFocus.length > 0) updates.domainFocus = a.domainFocus;
          if (typeof a.socraticTrigger === 'string' && a.socraticTrigger) updates.socraticTrigger = a.socraticTrigger;
          if (typeof a.uncertaintyProtocol === 'string' && a.uncertaintyProtocol) updates.uncertaintyProtocol = a.uncertaintyProtocol;
          if (a.outputRequirements && typeof a.outputRequirements === 'object') updates.outputRequirements = a.outputRequirements;
          if (Object.keys(updates).length > 0) window.__ca.storage.updateAnchor(newA.id, updates);
          if (Array.isArray(a.tags)) {
            for (var t = 0; t < a.tags.length; t++) window.__ca.storage.addTag(newA.id, a.tags[t]);
          }
          if (Array.isArray(a.triggerKeywords)) {
            for (var k = 0; k < a.triggerKeywords.length; k++) window.__ca.storage.addTriggerKeyword(newA.id, a.triggerKeywords[k]);
          }
        }
      }

      if (Array.isArray(payload.templates)) {
        for (var ti = 0; ti < payload.templates.length; ti++) {
          var tpl = payload.templates[ti];
          if (!tpl || typeof tpl.name !== 'string') { skippedT++; continue; }
          window.__ca.storage.createTemplate(tpl.name, tpl.text || '', tpl.tags, tpl.description || '');
          importedT++;
        }
      }

      if (Array.isArray(payload.bundles)) {
        for (var bi = 0; bi < payload.bundles.length; bi++) {
          var bun = payload.bundles[bi];
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

      if (Array.isArray(payload.constraints)) {
        for (var ci = 0; ci < payload.constraints.length; ci++) {
          var con = payload.constraints[ci];
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

      if (payload.heatmap && typeof payload.heatmap === 'object' && !Array.isArray(payload.heatmap) && Object.keys(payload.heatmap).length > 0) {
        window.__ca.storage.setUsageHeatmap(payload.heatmap);
      }

      var totalImported = importedA + importedT + importedB + importedC;
      if (totalImported > 0) {
        window.__ca.events.emit('anchors:changed');
        if (importedC > 0) window.__ca.events.emit('constraints:changed');
        var summary = importedA + ' anchors, ' + importedT + ' templates, ' + importedB + ' bundles, ' + importedC + ' constraints';
        if (duplicateA > 0) summary += ' (' + duplicateA + ' dup skipped)';
        if (skippedA + skippedT + skippedB + skippedC > 0) summary += ' (skipped)';
        if (payload.heatmap && Object.keys(payload.heatmap).length > 0) summary += ' + heatmap';
        showToast(summary, 'success');
        console.log('[CA] Pending import hydrated: anchors=' + importedA + '(dup=' + duplicateA + ',skipped=' + skippedA + '), templates=' + importedT + '(skipped=' + skippedT + '), bundles=' + importedB + '(skipped=' + skippedB + '), constraints=' + importedC + '(skipped=' + skippedC + ')' + (payload.heatmap && Object.keys(payload.heatmap).length > 0 ? ', heatmap' : ''));
      }
    });
  }

  window.__ca.content = {
    showToast: showToast,
    injectTextToPrompt: injectTextToPrompt,
    injectAnchorToPrompt: injectAnchorToPrompt,
    filterByScope: filterByScope,
    initSlashCommands: initSlashCommands,
    getProfileSystemInstruction: function() { return window.__ca.state.profileSystemInstruction; },
    getExtensionConfig: function() { return extensionConfig; },
    loadActiveProfile: loadActiveProfile,
    compileProfileSystemInstruction: compileProfileSystemInstruction,
    compileAnchorBehaviorBlock: compileAnchorBehaviorBlock,
    resetCMA: resetCMA,
    checkPendingSessionImports: checkPendingSessionImports
  };

  document.addEventListener('DOMContentLoaded', function() {
    init();
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  }
})();